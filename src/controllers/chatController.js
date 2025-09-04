import * as chatService from '../services/chatService.js';
import {leaveChatRoomService} from "../services/chatService.js";
import {ChatRoomExit} from "../models/chat.js";

/**
 * 채팅방 생성 컨트롤러
 */
export const createRoom = async (req, res) => {
    try {
        const { roomType, capacity, matchedGender, ageGroup } = req.body;
        const room = await chatService.createChatRoom(roomType, capacity, matchedGender, ageGroup);
        res.status(201).json(room);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

//친구와 채팅방 생성
export const createFriendRoom = async (req, res) => {
    try {
        const { roomType, capacity } = req.body;
        const room = await chatService.createFriendRoom(roomType, capacity);
        res.status(201).json(room);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

/**
 * 특정 채팅방 조회 컨트롤러
 */
// controllers/chatController.js
export const getRoomById = async (req, res) => {
    try {
        const room = await chatService.getChatRoomById(req.params.roomId);
        if (!room)
            return res.status(404).json({ message: '채팅방을 찾을 수 없습니다.' });

        // 1) 퇴장 목록 조회
        const exited = await ChatRoomExit.distinct('user', { chatRoom: room._id });

        // 2) 현재 남아 있는 유저만 필터링
        const activeUsers = room.chatUsers.filter(u =>
            !exited.some(id => id.toString() === u._id.toString())
        );

        // 3) payload 구성
        const payload = room.toObject();
        payload.activeUsers = activeUsers;   // 👈 새 필드
        // payload.chatUsers 는 그대로 둔다 (전체 참가자)

        return res.status(200).json(payload);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};


/**
 * 모든 채팅방 조회 컨트롤러 (필터링 및 페이징 지원)
 */
export const getAllRooms = async (req, res) => {
    try {
        // req.query를 그대로 전달하여 서버측 필터링 및 페이징을 적용
        const rooms = await chatService.getAllChatRooms(req.query);
        
        // 🔧 성별 선택 정보가 포함된 참가자 데이터 추가
        const roomsWithGenderInfo = rooms.map(room => {
            const roomObj = room.toObject();
            
            // 참가자에 성별 선택 정보 추가
            const chatUsersWithGender = roomObj.chatUsers.map(user => ({
                ...user,
                selectedGender: roomObj.genderSelections?.get(user._id.toString()) || null
            }));
            
            return {
                ...roomObj,
                chatUsersWithGender
            };
        });
        
        res.status(200).json(roomsWithGenderInfo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * 채팅방에 사용자 추가
 */
export const addUserToRoom = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { userId, selectedGender } = req.body;  // 🔧 selectedGender 추가

        const room = await chatService.addUserToRoom(roomId, userId, selectedGender);   // 🔧 selectedGender 전달
        return res.status(200).json(room);
    } catch (error) {

        // 서비스가 status 필드를 제공하면 그대로 사용
        const status = error.status || 500;
        return res.status(status).json({ error: error.message });
    }
};

/**
 * 메시지 저장 컨트롤러
 */
export const sendMessage = async (req, res) => {
    try {
        const { chatRoom, sender, text } = req.body;
        const message = await chatService.saveMessage(chatRoom, sender, text);
        res.status(201).json(message);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * 특정 채팅방의 메시지 가져오기
 */
export const getMessages = async (req, res) => {
    try {
        // 쿼리 파라미터 includeDeleted=true 면 히스토리 방 메시지도 모두 조회
        const includeDeleted = req.query.includeDeleted === 'true';
        const messages = await chatService.getMessagesByRoom(
            req.params.roomId,
            includeDeleted
        );
        res.status(200).json(messages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * 채팅 메시지 삭제
 */
export const deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const deletedMessage = await chatService.softDeleteMessage(messageId);
        res.status(200).json({ message: '메시지가 삭제되었습니다.', deletedMessage });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * 채팅방에서 사용자 제거
 */
export const leaveChatRoom = async (req, res) => {
    try {
        const { roomId, userId } = req.params;  // userId는 URL 파라미터에서 받기

        if (!userId) {
            return res.status(400).json({ message: "사용자 ID가 필요합니다." });
        }

        const result = await leaveChatRoomService(roomId, userId);
        res.status(200).json(result);
    } catch (error) {
        console.error("채팅방 나가기 실패:", error);  // 서버에서 발생한 오류 출력
        res.status(500).json({ success: false, message: "서버 오류", error: error.message });
    }
};

/**
 * 사용자 종료한 채팅방 ID 목록 조회 컨트롤러
 */
export const getLeftRooms = async (req, res) => {
    try {
        const { userId } = req.params;
        const leftRooms = await chatService.getUserLeftRooms(userId);
        res.status(200).json({ leftRooms });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const updateRoomActive = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { active } = req.body;            // Boolean
        const room = await chatService.setRoomActive(roomId, active);
        res.status(200).json(room);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


/**
 * GET /api/search/chat-room-history
 */
export const getChatRoomHistory = async (req, res) => {
    try {
        const dtoList = await chatService.getChatRoomHistory(req.query);
        return res.status(200).json({ dtoList });
    } catch (error) {
        console.error('히스토리 조회 실패:', error);
        return res.status(500).json({ error: error.message });
    }
};

/**
 * 메시지 읽음 처리 컨트롤러
 */
export const markMessagesAsRead = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { userId } = req.body;

        const result = await chatService.markMessagesAsRead(roomId, userId);
        res.status(200).json({
            success: true,
            message: '메시지를 읽음으로 표시했습니다.',
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * 안읽은 메시지 개수 조회
 */
export const getUnreadCount = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { userId } = req.query;

        const count = await chatService.getUnreadMessageCount(roomId, userId);
        res.status(200).json({ unreadCount: count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * 채팅방 입장 시간 기록 컨트롤러
 */
export const recordRoomEntry = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { userId, entryTime } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: '사용자 ID가 필요합니다.'
            });
        }

        const result = await chatService.recordRoomEntry(roomId, userId, entryTime);

        res.status(200).json({
            success: true,
            message: result.isUpdate ? '입장 시간이 업데이트되었습니다.' : '입장 시간이 기록되었습니다.',
            entryTime: result.entryTime,
            isUpdate: result.isUpdate
        });
    } catch (error) {
        console.error('채팅방 입장 시간 기록 실패:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};