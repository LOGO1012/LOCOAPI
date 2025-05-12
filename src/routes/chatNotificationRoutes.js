// src/routes/chatNotificationRoutes.js
import express from 'express';
import * as ctrl from '../controllers/chatNotificationController.js';

const router = express.Router();

// 사용자의 읽지 않은 알림 목록 조회
router.get('/:userId', ctrl.getNotifications);

// 알림 읽음 처리
router.put('/:id/read', ctrl.markRead);

export default router;
