// QnaRouter.js
import express from 'express';
import QnaController from '../controllers/qnaController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requireLevel } from '../middlewares/requireLevel.js';

const router = express.Router();

// GET / - 전체 QnA 목록 조회 (공개)
router.get('/', QnaController.getQnaListPage);

// POST / - 새로운 QnA 등록 (로그인 필수)
router.post('/', authenticate, QnaController.createQna);

// PUT /:id - 질문 수정 (작성자 본인만)
router.put('/:id', authenticate, QnaController.updateQna);

// POST /:id/answer - 답변 작성 (관리자 Lv≥3 전용)
router.post('/:id/answer', authenticate, requireLevel(3), QnaController.addAnswer);

// DELETE /:id - QnA 삭제 (작성자 본인 또는 관리자)
router.delete('/:id', authenticate, QnaController.deleteQna);

export default router;
