// src/routes/developerRoutes.js
import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requireLevel } from '../middlewares/requireLevel.js';
import { getDeveloperUsers, updateDeveloperUser } from '../controllers/developerController.js';

const router = express.Router();

// 1) JWT 인증
router.use(authenticate);
// 2) userLv ≥ 3 인 사용자만 허용
router.use(requireLevel(3));


// GET /api/developer/users – 유저 목록 조회 (페이징)
router.get('/users', getDeveloperUsers);

// PATCH /api/developer/users/:userId – 선택한 유저 업데이트
router.patch('/users/:userId', updateDeveloperUser);

export default router;
