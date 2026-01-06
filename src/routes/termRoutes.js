import express from 'express';
import {
    createTerm,
    getAllTerms,
    getTermById,
    updateTerm,
    deleteTerm,
    getActiveTerms,
    getMissingConsents,
    submitConsent
} from '../controllers/termController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import {requireLevel} from "../middlewares/requireLevel.js";
// 관리자 권한 미들웨어가 필요하다면 추가 (예: requireAdmin or requireLevel)
// 여기서는 일단 authenticate만 적용하고, 실제 관리자 권한 로직은 프로젝트 규칙에 따름.
// adminRoutes를 보니 별도 미들웨어가 있을 수 있음.

const router = express.Router();

// Public or Authenticated User Routes
router.get('/active', getActiveTerms); // 로그인 전에도 볼 수 있어야 함 (회원가입 등)
router.get('/check-consent', authenticate, getMissingConsents); // 로그인 후 필수 약관 체크
router.post('/consent', authenticate, submitConsent); // 동의 제출

// Admin Routes (관리자 권한 필요 - Lv 2 이상)
router.post('/', authenticate, requireLevel(3), createTerm); // 새 약관 생성
router.get('/', authenticate, requireLevel(3), getAllTerms); // 전체 약관 목록
router.get('/:id', authenticate, requireLevel(3), getTermById); // 상세 조회
router.put('/:id', authenticate, requireLevel(3), updateTerm); // 약관 수정
router.delete('/:id', authenticate, requireLevel(3), deleteTerm); // 약관 삭제

export default router;
