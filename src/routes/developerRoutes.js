// src/routes/developerRoutes.js
import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requireLevel } from '../middlewares/requireLevel.js';
import { getDeveloperUsers, updateDeveloperUser, getDeveloperUserDetail, getCacheStatus } from '../controllers/developerController.js';

const router = express.Router();

// 1) JWT 인증
router.use(authenticate);
// 2) userLv ≥ 3 인 사용자만 허용
router.use(requireLevel(3));


// GET /api/developer/users – 유저 목록 조회 (페이징, 복호화 적용)
router.get('/users', getDeveloperUsers);

// GET /api/developer/cache-status – 캐시 상태 확인 (디버깅용)
router.get('/cache-status', getCacheStatus);

// GET /api/developer/users/:userId – 특정 유저 상세 조회 (복호화 적용)
router.get('/users/:userId', getDeveloperUserDetail);

// PATCH /api/developer/users/:userId – 선택한 유저 업데이트 (암호화 적용)
router.patch('/users/:userId', updateDeveloperUser);

export default router;
