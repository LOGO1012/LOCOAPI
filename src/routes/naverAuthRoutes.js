// 파일 경로: src/routes/naverAuthRoutes.js
// 네이버 콜백 엔드포인트만 처리하는 라우터입니다.
import express from 'express';
import {naverCallback, logout, logoutRedirect, naverRefreshToken} from '../controllers/naverAuthController.js';

const router = express.Router();

router.get('/naver/callback', (req, res, next) => {
    console.log('네이버 콜백 라우트 호출됨');
    naverCallback(req, res, next);
});

router.get('/naver-data', (req, res) => {
    res.json({
        socialData: req.session.naverUserData || {},
        deactivationCount: req.session.deactivationCount || 0
    });
});

router.post('/naver/refresh', naverRefreshToken);
router.post('/logout', logout);

// 6) 카카오/네이버 로그아웃 후 프론트 리다이렉트용
router.get('/logout-redirect', logoutRedirect);

export default router;
