import express from 'express';
import * as chatController from '../controllers/chatController.js';

const router = express.Router();

// 채팅방 생성
router.post('/rooms', chatController.createRoom);

//친구와 채팅방 생성
router.post("/friend/rooms", chatController.createFriendRoom);

// 특정 채팅방 조회
router.get('/rooms/:roomId', chatController.getRoomById);

// 모든 채팅방 조회
router.get('/rooms', chatController.getAllRooms);

// 채팅방에 사용자 추가
router.post('/rooms/:roomId/join', chatController.addUserToRoom);

// 메시지 저장
router.post('/messages', chatController.sendMessage);

// 특정 채팅방의 메시지 가져오기
router.get('/messages/:roomId', chatController.getMessages);

// 메시지 삭제
router.put('/messages/:messageId', chatController.deleteMessage);

// 채팅방에서 사용자 제거
router.delete('/rooms/:roomId/:userId', chatController.leaveChatRoom);

export default router;
