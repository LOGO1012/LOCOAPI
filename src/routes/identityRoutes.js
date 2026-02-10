// src/routes/identityRoutes.js
// 포트원 V2 본인인증 라우트
import express from 'express';
import { verifyIdentity, getIdentityStatus } from '../controllers/identityController.js';

const router = express.Router();

// 본인인증 결과 검증
router.post('/verify', verifyIdentity);

// 본인인증 상태 확인
router.get('/status', getIdentityStatus);

export default router;
