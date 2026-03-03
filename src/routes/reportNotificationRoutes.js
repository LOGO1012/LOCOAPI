import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import {
    getNotifications,
    markNotificationAsRead,
    markNotificationAsReadAndDelete
} from '../controllers/reportNotificationController.js';

const router = Router();

// 예: GET /notifications/:userId - 미확인 알림 조회
router.get('/:userId', authenticate, getNotifications);

// 예: PATCH /notifications/:notificationId - 알림 읽음 처리
router.patch('/:notificationId', authenticate, markNotificationAsRead);

// 예: PATCH /notifications/:notificationId/delete - 알림 읽음 후 즉시 삭제
router.patch('/:notificationId/delete', authenticate, markNotificationAsReadAndDelete);

export default router;
