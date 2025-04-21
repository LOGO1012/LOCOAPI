import {ChatRoom, ChatMessage, ChatRoomExit} from '../models/chat.js';
import {User} from "../models/UserProfile.js";

/**
 * 새로운 채팅방 생성
 */
export const createChatRoom = async (roomType, capacity, matchedGender, ageGroup) => {
    try {
        const newChatRoom = new ChatRoom({
            roomType,
            capacity,
            matchedGender,
            ageGroup
        });
        return await newChatRoom.save();
    } catch (error) {
        throw new Error(error.message);
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
 * filters.userId 를 넘기면, 해당 사용자가 차단한 사용자가 포함된 방을 제외합니다.
 */
export const getAllChatRooms = async (filters) => {
    const query = {};

    // 차단된 사용자 포함 방 제외
    if (filters.userId) {
        const me = await User.findById(filters.userId).select('blockedUsers');
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
        const room = await ChatRoom.findById(roomId);
        if (!room) {
            throw new Error('채팅방을 찾을 수 없습니다.');
        }

        // 유저가 이미 채팅방에 없으면 추가
        if (!room.chatUsers.includes(userId)) {
            room.chatUsers.push(userId);
        }

        // 채팅방이 'random'일 때, 정원이 찼으면 채팅방을 활성화
        if (room.roomType === 'random' && room.chatUsers.length >= room.capacity) {
            room.isActive = true;
            room.status = 'active';  // 상태를 'active'로 변경
        }

        await room.save();  // 상태와 isActive 변경 후 저장
        return room;
    } catch (error) {
        throw new Error(error.message);
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
            sender = { _id: user._id, nickname: user.nickname };
        }

        const newMessage = new ChatMessage({ chatRoom, sender, text });
        return await newMessage.save();
    } catch (error) {
        throw new Error(error.message);
    }
};

/**
 * 특정 채팅방의 메시지 가져오기
 */
export const getMessagesByRoom = async (roomId) => {
    return await ChatMessage.find({ chatRoom: roomId, isDeleted: false })
        .populate('sender', 'nickname')
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
        // 이미 퇴장 기록이 있는지 확인합니다.
        const existingExit = await ChatRoomExit.findOne({ chatRoom: roomId, user: userId });
        if (!existingExit) {
            await ChatRoomExit.create({ chatRoom: roomId, user: userId });
        }

        // 채팅방 정보를 가져옵니다.
        const chatRoom = await ChatRoom.findById(roomId);
        if (!chatRoom) {
            throw new Error("채팅방을 찾을 수 없습니다.");
        }

        // 채팅방의 총 사용자 수를 계산합니다.
        const totalUsers = chatRoom.chatUsers.length;

        // 채팅방에서 이미 퇴장한 사용자 ID 목록을 조회합니다.
        const exitedUsers = await ChatRoomExit.distinct('user', { chatRoom: roomId });

        // 모든 사용자가 퇴장한 경우
        if (exitedUsers.length >= totalUsers) {
            // 채팅 메시지 삭제: isDeleted 플래그를 true로 업데이트합니다.
            await ChatMessage.updateMany(
                { chatRoom: roomId, isDeleted: false },
                { $set: { isDeleted: true } }
            );
            // 채팅방 삭제
            await ChatRoom.deleteOne({ _id: roomId });
            // 해당 채팅방의 모든 exit 기록 삭제
            await ChatRoomExit.deleteMany({ chatRoom: roomId });
        }

        return { success: true, message: "채팅방에서 나갔습니다." };
    } catch (error) {
        console.error('채팅방 나가기 중 오류:', error);
        throw error;
    }
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









