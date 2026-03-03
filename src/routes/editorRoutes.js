import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { authenticate } from '../middlewares/authMiddleware.js';
import { validateImageMagicBytes } from '../utils/upload.js';

const router = express.Router();

// uploads/news/editor 디렉토리 자동 생성
const editorUploadDir = 'uploads/news/editor';
if (!fs.existsSync(editorUploadDir)) {
    fs.mkdirSync(editorUploadDir, { recursive: true });
    console.log('에디터 업로드 디렉토리 생성:', editorUploadDir);
}

// 에디터용 이미지 업로드 설정 (뉴스 작성 중)
const editorStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/news/editor/');
    },
    filename: (req, file, cb) => {
        // M-17 보안 조치: originalname 대신 UUID 사용 (경로 탐색 방지)
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.tmp';
        cb(null, `editor-${uuid()}${ext}`);
    }
});

const editorUpload = multer({
    storage: editorStorage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('이미지 파일만 업로드 가능합니다.'), false);
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB 제한
    }
});

import sharp from 'sharp';

// ... (rest of the imports)

// ... (multer setup)

// M-17 보안 조치: authenticate 미들웨어로 인증 통일 (인라인 JWT 파싱 제거)
router.post('/upload-image', authenticate, editorUpload.single('image'), validateImageMagicBytes, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: '이미지 파일이 없습니다.'
            });
        }

        // sharp를 이용한 이미지 처리
        const originalNameWithoutExt = path.parse(req.file.filename).name;
        const processedFilename = `${originalNameWithoutExt}.webp`;
        const processedImagePath = path.join('uploads', 'news', 'editor', processedFilename);

        await sharp(req.file.path)
            .resize({ width: 1200, withoutEnlargement: true }) // 너비 1200px로 리사이즈 (이미지가 작으면 확대 안함)
            .webp({ quality: 80 }) // WebP 변환
            .toFile(processedImagePath);

        // 원본 파일 삭제
        try {
            fs.unlinkSync(req.file.path);
        } catch (err) {
            console.error("원본 파일 삭제 실패:", err);
        }

        // 이미지 URL 반환
        const imageUrl = `/uploads/news/editor/${processedFilename}`;
        
        console.log('📸 에디터 이미지 최적화 성공:', {
            filename: processedFilename,
            url: imageUrl,
        });
        
        res.status(200).json({
            success: true,
            data: {
                url: imageUrl
            }
        });
    } catch (error) {
        console.error('에디터 이미지 업로드 오류:', error);
        res.status(500).json({
            success: false,
            message: '이미지 업로드에 실패했습니다.'
        });
    }
});

export default router;
