import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
    getActiveBanners,
    getAllBanners,
    getBannerDetail,
    createBanner,
    updateBanner,
    deleteBanner,
    incrementBannerViews
} from '../controllers/bannerController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requireLevel } from '../middlewares/requireLevel.js';

const router = express.Router();

// uploads/banners 디렉토리 자동 생성
const uploadDir = 'uploads/banners';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('배너 업로드 디렉토리 생성:', uploadDir);
}

// Multer 설정 (배너 이미지 업로드)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/banners/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'banner-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    // 이미지 파일만 허용
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('이미지 파일만 업로드 가능합니다.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB 제한 (배너는 큰 이미지)
        files: 1
    }
});

// 공개 라우트
router.get('/active', getActiveBanners);           // 활성 배너 목록 (메인페이지용)
router.post('/:id/view', incrementBannerViews);    // 배너 클릭 수 증가

// 관리자 라우트 (lv3 이상)
router.get('/', authenticate, requireLevel(3), getAllBanners);                    // 모든 배너 목록 (관리자용)
router.get('/:id', authenticate, requireLevel(3), getBannerDetail);               // 배너 상세 조회
router.post('/', authenticate, requireLevel(3), upload.single('image'), createBanner);     // 배너 생성
router.put('/:id', authenticate, requireLevel(3), upload.single('image'), updateBanner);   // 배너 수정
router.delete('/:id', authenticate, requireLevel(3), deleteBanner);               // 배너 삭제

export default router;
