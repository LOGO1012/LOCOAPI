import { Router } from 'express';
import * as reportController from '../controllers/reportController.js';

const router = Router();

// 신고 생성
router.post('/reports', reportController.createReport);

// 전체 신고 목록 조회
router.get('/reports', reportController.getReports);

// 특정 신고 조회
router.get('/reports/:id', reportController.getReport);

// 신고 수정
router.put('/reports/:id', reportController.updateReport);

// 신고 삭제
router.delete('/reports/:id', reportController.deleteReport);

// 신고에 대한 답변 추가 라우트
router.post('/reports/:id/reply', reportController.replyToReport);

export default router;
