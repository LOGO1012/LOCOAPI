import {ChatRoom, ChatMessage, ChatRoomExit} from '../models/chat.js';
import {User} from "../models/UserProfile.js";
import { ChatRoomHistory } from "../models/chatRoomHistory.js";

/**
 * 새로운 채팅방 생성
 */
export const createChatRoom = async (roomType, capacity, matchedGender, ageGroup) => {
    try {
        // 1) 방 생성
        const newChatRoom = new ChatRoom({ roomType, capacity, matchedGender, ageGroup });
        const saved = await newChatRoom.save();


        return saved;
    } catch (error) {
        // 에러 스택까지 찍어서 어디서 터졌는지 확인
        console.error('[chatService.createChatRoom] error:', error);
        throw error;
    }
};

// 친구와 채팅방 생성
export const createFriendRoom = async (roomType, capacity) => {
    try {
        const newChatRoom = new ChatRoom({
            roomType,
            capacity
        });
        return await newChatRoom.save();
    } catch (error) {
        throw new Error(error.message);
    }
}

/**
 * 특정 채팅방 조회
 */
export const getChatRoomById = async (roomId) => {
    return await ChatRoom.findById(roomId).populate('chatUsers');
};

/**
 * 모든 채팅방 목록 조회 (서버측 필터링 및 페이징 적용)
 * @param {object} filters - 쿼리 파라미터 객체 (roomType, capacity, matchedGender, ageGroup, status, page, limit 등)
 */
export const getAllChatRooms = async (filters) => {
    const query = {};
    if (filters.chatUsers) {
        query.chatUsers = filters.chatUsers;
    }

    // 차단된 사용자 포함 방 제외
    if (filters.userId) {
        const me = await User.findById(filters.userId).select('blockedUsers');
        const exited = await ChatRoomExit.distinct('chatRoom', { user: filters.userId });
        if (exited.length) query._id = { $nin: exited };   // 이미 나간 방 제외
        if (me && me.blockedUsers.length > 0) {
            query.chatUsers = { $nin: me.blockedUsers };
        }
    }

    if (filters.roomType)    query.roomType     = filters.roomType;
    if (filters.capacity)    query.capacity     = parseInt(filters.capacity);
    if (filters.matchedGender) query.matchedGender = filters.matchedGender;
    if (filters.ageGroup)    query.ageGroup     = filters.ageGroup;

    const page  = parseInt(filters.page)  || 1;
    const limit = parseInt(filters.limit) || 10;
    const skip  = (page - 1) * limit;

    const rooms = await ChatRoom.find(query)
        .populate('chatUsers')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    return rooms;
};

/**
 * 채팅방에 사용자 추가
 */
export const addUserToRoom = async (roomId, userId) => {
    try {

        // 1) 방  현재 참가자들의 blockedUsers 정보 조회
        const room = await ChatRoom.findById(roomId)
            .populate('chatUsers', 'blockedUsers')   // ← 추가
            .exec();
        if (!room) {
            throw new Error('채팅방을 찾을 수 없습니다.');
        }

        /* 🔒 이미 퇴장한 적이 있으면 재입장 금지 */
        const hasExited = await ChatRoomExit.exists({                    // [3]
            chatRoom: roomId, user: userId
        });
        if (hasExited) {
            const err = new Error('이미 퇴장한 채팅방입니다.');
            err.status = 403;
            throw err;                                                     // controller에서 그대로 전송
        }

        // 2) 입장하려는 사용자 본인의 blockedUsers 가져오기
        const joiner = await User.findById(userId).select('blockedUsers');
        if (!joiner) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }

        // 3) 차단 관계 양방향 검사
        const blockedByMe = room.chatUsers.some(u =>
            joiner.blockedUsers.includes(u._id)
        );
        const blockedMe = room.chatUsers.some(u =>
            u.blockedUsers.includes(userId)
        );

        if (blockedByMe || blockedMe) {
            const err = new Error('차단 관계가 있는 사용자와 함께할 수 없습니다.');
            err.status = 403;          // 컨트롤러에서 그대로 사용
            throw err;
        }

        // 4) 기존 로직 유지 ― 실제로 방에 추가
        if (!room.chatUsers.includes(userId)) {
            room.chatUsers.push(userId);

            if (room.roomType === 'random' && room.chatUsers.length >= room.capacity) {
                room.isActive = true;
                room.status = 'active';
                return await room.save();
            }
        }
        await room.save();
        return room;
    } catch (error) {
        throw error;
    }
};

/**
 * 메시지 저장
 */
export const saveMessage = async (chatRoom, sender, text) => {
    try {
        // sender가 문자열(ID)일 경우, 사용자 정보 조회
        if (typeof sender === 'string') {
            const user = await User.findById(sender);
            if (!user) {
                throw new Error('사용자를 찾을 수 없습니다.');
            }
            sender = { _id: user._id,
                nickname: user.nickname,
                lolNickname: user.lolNickname,
                gender: user.gender,
                star: user.star,
                info: user.info,
                photo: user.photo};
        }

        const newMessage = new ChatMessage({ chatRoom, sender, text });
        return await newMessage.save();
    } catch (error) {
        throw new Error(error.message);
    }
};

/**
 * 특정 채팅방의 메시지 가져오기
 * @param {boolean} includeDeleted - true면 isDeleted 플래그에 관계없이 모두 조회
 */
export const getMessagesByRoom = async (roomId, includeDeleted = false) => {
    const filter = includeDeleted
        ? { chatRoom: roomId }                    // 삭제 여부 무시
        : { chatRoom: roomId, isDeleted: false }; // 기본: 삭제되지 않은 메시지만
    return await ChatMessage.find(filter)
        .populate('sender')       // 닉네임·이름 모두 필요하면 name도 추가
        .exec();
};

/**
 * 채팅 메시지 삭제
 */
export const softDeleteMessage = async (messageId) => {
    try {
        const message = await ChatMessage.findById(messageId);
        if (!message) throw new Error('메시지를 찾을 수 없습니다.');

        message.isDeleted = true;
        await message.save();
        return message;
    } catch (error) {
        throw new Error(error.message);
    }
};


/**
 * 채팅방에서 사용자 제거
 */
export const leaveChatRoomService = async (roomId, userId) => {
    try {
        /* ① 방 조회 */
        const chatRoom = await ChatRoom.findById(roomId);
        if (!chatRoom) throw new Error('채팅방을 찾을 수 없습니다.');

        /* ② phase 결정 : waiting | active */
        const phase = chatRoom.status === 'waiting' ? 'waiting' : 'active';

        /* ③ Exit 레코드 upsert */
        let exit = await ChatRoomExit.findOne({ chatRoom: roomId, user: userId });
        if (!exit) {
            exit = await ChatRoomExit.create({ chatRoom: roomId, user: userId, phase });
        } else if (exit.phase !== phase) {
            exit.phase = phase;          // waiting → active 로 승격
            await exit.save();
        }

        /* ④ 단계별 참가자 배열 처리 */
        if (phase === 'waiting') {
            chatRoom.chatUsers = chatRoom.chatUsers.filter(
                uid => uid.toString() !== userId.toString()
            );
            await chatRoom.save();       // 빈 슬롯 반영
        }
        // active 단계는 배열 유지(매너 평가용)

        /* ⑤ 방 삭제 판단 */
        let shouldDelete = false;
        if (phase === 'waiting') {
            shouldDelete = chatRoom.chatUsers.length === 0;
        } else {
            const activeExitCnt = await ChatRoomExit.countDocuments({
                chatRoom: roomId,
                phase:    'active'
            });
            shouldDelete = activeExitCnt >= chatRoom.capacity;
        }

        /* ⑥ 정리 & 삭제 */
        if (shouldDelete) {
            await ChatRoomHistory.create({
                chatRoomId: chatRoom._id,
                meta: {
                    chatUsers:     chatRoom.chatUsers,
                    capacity:      chatRoom.capacity,
                    roomType:      chatRoom.roomType,
                    matchedGender: chatRoom.matchedGender,
                    ageGroup:      chatRoom.ageGroup,
                    createdAt:     chatRoom.createdAt
                }
            });
            await ChatMessage.updateMany(
                { chatRoom: roomId, isDeleted: false },
                { $set: { isDeleted: true } }
            );
            await ChatRoom.deleteOne({ _id: roomId });
            await ChatRoomExit.deleteMany({ chatRoom: roomId });
        }

        return { success: true, message: '채팅방에서 나갔습니다.' };
    } catch (err) {
        console.error('[leaveChatRoomService] error:', err);
        throw err;
    }
};

/**
 * 랜덤채팅 히스토리 조회
 * @param {{ 'meta.chatUsers': string, page?: number, size?: number }} filters
 */
export const getChatRoomHistory = async (filters) => {
    const page = parseInt(filters.page)  || 1;
    const size = parseInt(filters.size)  || 100;
    const skip = (page - 1) * size;

    // meta.chatUsers 필터에 걸리는 히스토리만, user 객체로 채워서 가져오기
    const histories = await ChatRoomHistory
        .find({ 'meta.chatUsers': filters['meta.chatUsers'] })
        .lean()
        .populate('meta.chatUsers', 'nickname name')    // ← 여기를 추가합니다
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(size);

    return histories;
};

/**
 * 사용자 exit 기록을 기반으로 종료한 채팅방 ID 목록 조회
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Array>} - 종료한 채팅방 ID 배열
 */
export const getUserLeftRooms = async (userId) => {
    try {
        const leftRooms = await ChatRoomExit.distinct('chatRoom', { user: userId });
        return leftRooms;
    } catch (error) {
        throw new Error(error.message);
    }
};
// isActive 토글
export const setRoomActive = async (roomId, active) => {
    const room = await ChatRoom.findById(roomId);
    if (!room) throw new Error('채팅방을 찾을 수 없습니다.');
    room.isActive = active;
    return await room.save();
};

export const saveSystemMessage = async (roomId, text) => {
    const msg = new ChatMessage({ chatRoom: roomId, sender: null, text, isSystem: true });
    return await msg.save();
};








