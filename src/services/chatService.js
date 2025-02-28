import { ChatRoom, ChatMessage } from '../models/chat.js';

/**
 * 새로운 채팅방 생성
 */
export const createChatRoom = async (roomType, capacity, matchedGender) => {
    try {
        const newChatRoom = new ChatRoom({
            roomType,
            capacity,
            matchedGender,
        });
        return await newChatRoom.save();
    } catch (error) {
        throw new Error(error.message);
    }
};

/**
 * 특정 채팅방 조회
 */
export const getChatRoomById = async (roomId) => {
    return await ChatRoom.findById(roomId).populate('chatUsers');
};

/**
 * 모든 채팅방 목록 조회
 */
export const getAllChatRooms = async () => {
    return await ChatRoom.find().populate('chatUsers');
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
        .populate('sender', 'name')
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
        const chatRoom = await ChatRoom.findById(roomId);
        if (!chatRoom) {
            throw new Error("채팅방을 찾을 수 없습니다.");
        }

        // chatUsers에서 해당 사용자 제거
        chatRoom.chatUsers = chatRoom.chatUsers.filter(user => user._id.toString() !== userId);

        // 채팅방이 비어 있으면 비활성화
        if (chatRoom.chatUsers.length === 0) {
            chatRoom.isActive = false;
            chatRoom.status = 'waiting';

            // 채팅방에 남은 사용자가 없으면 해당 채팅방의 모든 메시지 삭제
            await ChatMessage.updateMany({ chatRoom: roomId, isDeleted: false }, { $set: { isDeleted: true } });

            // 채팅방 삭제
            await ChatRoom.deleteOne({ _id: roomId });
        }

        // 버전 오류를 피하기 위해 updateOne 사용
        await ChatRoom.updateOne({ _id: roomId }, { $set: { chatUsers: chatRoom.chatUsers } });

        return { success: true, message: "채팅방에서 나갔습니다." };
    } catch (error) {
        console.error('채팅방 나가기 중 오류:', error);  // 에러 로그 추가
        throw error;  // 오류 다시 던지기
    }
};







