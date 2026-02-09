// QnaRouter.js
import express from 'express';
import QnaController from '../controllers/qnaController.js';

const router = express.Router();

// POST / - 새로운 QnA 등록
router.post('/', QnaController.createQna);

// GET / - 전체 QnA 목록 조회
router.get('/', QnaController.getQnaListPage);

// PUT /:id - 특정 QnA 문서 업데이트 (답변 추가 등)
router.put('/:id', QnaController.updateQna);

// DELETE /:id - 특정 QnA 문서 삭제
router.delete('/:id', QnaController.deleteQna);

export default router;
