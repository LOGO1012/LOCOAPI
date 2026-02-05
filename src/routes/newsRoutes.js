import express from 'express';
import multer from 'multer';
import path from 'path';
import {
    getNewsList,
    getNewsDetail,
    createNews,
    updateNews,
    deleteNews
} from '../controllers/newsController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requireLevel } from '../middlewares/requireLevel.js';

const router = express.Router();

// Multer 설정 (이미지 업로드)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/news/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'news-' + uniqueSuffix + path.extname(file.originalname));
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
        fileSize: 5 * 1024 * 1024, // 5MB 제한
        files: 10 // 최대 10개 파일
    }
});

// 공개 라우트
router.get('/', getNewsList);           // 뉴스 목록 조회
router.get('/:id', getNewsDetail);      // 뉴스 상세 조회

// 개발자 전용 라우트 (lv3 이상)
router.post('/', authenticate, requireLevel(3), upload.array('images', 10), createNews);     // 뉴스 작성
router.put('/:id', authenticate, requireLevel(3), upload.array('images', 10), updateNews);   // 뉴스 수정
router.delete('/:id', authenticate, requireLevel(3), deleteNews);                            // 뉴스 삭제

export default router;
