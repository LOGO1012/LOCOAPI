// 파일 경로: src/routes/naverAuthRoutes.js
// 네이버 콜백 엔드포인트만 처리하는 라우터입니다.
import express from 'express';
import { naverCallback } from '../controllers/naverAuthController.js';

const router = express.Router();

router.get('/naver/callback', (req, res, next) => {
    console.log('네이버 콜백 라우트 호출됨');
    naverCallback(req, res, next);
});

router.get('/naver-data', (req, res) => {
    res.json(req.session.naverUserData || {});
});


export default router;
