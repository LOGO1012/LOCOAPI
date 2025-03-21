// backend/routes/kakaoPayRoutes.js
import express from 'express';
import {
    kakaoPaySubscribeReady,
    kakaoPaySubscription,
    kakaoPaySubscribeApprove,
    kakaoPaySubscribeCancel,
    kakaoPaySubscribeFail
} from '../controllers/kakaoPayController.js';


const router = express.Router();
// 최초 정기 결제 준비 (1회차)

router.post('/subscribe/ready', kakaoPaySubscribeReady);

// 2회 차 이후 정기 결제 요청 (SID 사용)
router.post('/subscription', kakaoPaySubscription);

// 결제 승인, 취소, 실패 콜백 엔드포인트
router.get('/subscribe/approve', kakaoPaySubscribeApprove);
router.get('/subscribe/cancel', kakaoPaySubscribeCancel);
router.get('/subscribe/fail', kakaoPaySubscribeFail);

export default router;
