// src/routes/developerRoutes.js
import express from 'express';
import { getDeveloperUsers, updateDeveloperUser } from '../controllers/developerController.js';

const router = express.Router();

// GET /api/developer/users – 유저 목록 조회 (페이징)
router.get('/users', getDeveloperUsers);

// PATCH /api/developer/users/:userId – 선택한 유저 업데이트
router.patch('/users/:userId', updateDeveloperUser);

export default router;
