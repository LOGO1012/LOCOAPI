import express from 'express';
import * as chatController from '../controllers/chatController.js';


const router = express.Router();

// 채팅방 생성
router.post('/rooms', chatController.createRoom);

// 방 찾기 또는 생성
router.post('/rooms/find-or-create', chatController.findOrCreateRoom);

// 새로 추가: 친구방 찾기 또는 생성 (통합 API)
router.post("/friend/rooms/find-or-create", chatController.findOrCreateFriendRoomController);

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

// 여러 채팅방의 마지막 메시지 일괄 조회
router.post('/messages/batch-last', chatController.getLastMessagesBatch);

// 메시지 삭제
router.put('/messages/:messageId', chatController.deleteMessage);

// 채팅방에서 사용자 제거
router.delete('/rooms/:roomId/:userId', chatController.leaveChatRoom);

// 사용자 종료한 채팅방 ID 목록 조회
//router.get('/leftRooms/:userId', chatController.getLeftRooms);

router.patch('/rooms/:roomId/active', chatController.updateRoomActive);

router.get('/search/chat-room-history', chatController.getChatRoomHistory);

// 메시지 읽음 처리
router.patch('/rooms/:roomId/read', chatController.markMessagesAsRead);

// 안읽은 메시지 개수 조회
router.get('/rooms/:roomId/unread', chatController.getUnreadCount);

// 안읽은 메시지 개수 조회 (배치)
router.post('/rooms/unread-batch', chatController.getUnreadCountsBatch);

router.post('/rooms/:roomId/entry', chatController.recordRoomEntry);

// ============================================================================
//   🚨 메시지 신고 API
// ============================================================================

// 개별 메시지 신고
router.post('/messages/:messageId/report', chatController.reportMessage);

// 🆕 채팅방의 신고된 메시지 목록 조회 (개발자 페이지용)
router.get('/rooms/:roomId/reported-messages', chatController.getReportedMessages);

export default router;
