//src/routes/reportRoutes.js
import { Router } from 'express';
import * as reportController from '../controllers/reportController.js';
//접근제한
import { authenticate } from '../middlewares/authMiddleware.js';
import { requireLevel } from '../middlewares/requireLevel.js';

const router = Router();

// 신고 생성
router.post('/reports', reportController.createReport);

//이 코드 작성된 이하의 코드들한테 적용됨
router.use(
    authenticate,       // JWT 인증 검사
    requireLevel(2)     // userLv ≥ 2
);

// 전체 신고 목록 조회
router.get('/reports', reportController.getReports);

// 특정 신고 조회
router.get('/reports/:id', reportController.getReport);

// 신고 수정
router.put('/reports/:id', reportController.updateReport);

// 신고 삭제
router.delete(
    '/reports/:id',
    requireLevel(3),
    reportController.deleteReport
);

// 신고에 대한 답변 추가 라우트
router.post('/reports/:id/reply', reportController.replyToReport);

// (관리자 전용) 신고된 채팅방 메시지 가져오기
router.get('/reports/:id/chat-log', reportController.getReportChatLog);

export default router;
