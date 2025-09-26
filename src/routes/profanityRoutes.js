// LOCOAPI/src/routes/profanityRoutes.js
import express from 'express';
import { getWords, addWord, deleteWord } from '../controllers/profanityController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requireLevel } from '../middlewares/requireLevel.js';

const router = express.Router();

// 이 라우터의 모든 경로는 인증 및 userLv 3 이상 필요
router.use(authenticate, requireLevel(3));

// GET /api/profanity/words - 모든 비속어 목록 조회
router.get('/words', getWords);

// POST /api/profanity/words - 새로운 비속어 추가
router.post('/words', addWord);

// DELETE /api/profanity/words - 비속어 삭제
router.delete('/words', deleteWord);

export default router;
