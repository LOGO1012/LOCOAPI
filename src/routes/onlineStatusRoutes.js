import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import * as onlineStatusController from '../controllers/onlineStatusController.js';

const router = express.Router();

// 온라인 사용자 통계 (구체적인 경로를 먼저 배치)
router.get('/stats', authenticate, onlineStatusController.getOnlineStats);

// 여러 사용자 온라인 상태 조회
router.post('/bulk', authenticate, onlineStatusController.getBulkOnlineStatus);

// 단일 사용자 온라인 상태 조회 (동적 경로를 마지막에 배치)
router.get('/:userId', authenticate, onlineStatusController.getSingleOnlineStatus);

export default router;
