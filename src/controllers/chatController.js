import * as chatService from '../services/chatService.js';
import {leaveChatRoomService} from "../services/chatService.js";

/**
 * 채팅방 생성 컨트롤러
 */
export const createRoom = async (req, res) => {
    try {
        const { roomType, capacity, matchedGender } = req.body;
        const room = await chatService.createChatRoom(roomType, capacity, matchedGender);
        res.status(201).json(room);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * 특정 채팅방 조회 컨트롤러
 */
export const getRoomById = async (req, res) => {
    try {
        const room = await chatService.getChatRoomById(req.params.roomId);
        if (!room) return res.status(404).json({ message: '채팅방을 찾을 수 없습니다.' });
        res.status(200).json(room);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * 모든 채팅방 조회 컨트롤러
 */
export const getAllRooms = async (req, res) => {
    try {
        const rooms = await chatService.getAllChatRooms();
        res.status(200).json(rooms);
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
        const { userId } = req.body;
        const room = await chatService.addUserToRoom(roomId, userId);
        res.status(200).json(room);
    } catch (error) {
        res.status(500).json({ error: error.message });
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
        const messages = await chatService.getMessagesByRoom(req.params.roomId);
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




