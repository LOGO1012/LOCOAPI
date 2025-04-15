import { Router } from 'express';
import { getNotifications, markNotificationAsRead } from '../controllers/reportNotificationController.js';

const router = Router();

// 예: GET /notifications/:userId - 미확인 알림 조회
router.get('/:userId', getNotifications);

// 예: PATCH /notifications/:notificationId - 알림 읽음 처리
router.patch('/:notificationId', markNotificationAsRead);

export default router;
