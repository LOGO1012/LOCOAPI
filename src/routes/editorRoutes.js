import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { User } from '../models/UserProfile.js';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

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
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'editor-' + uniqueSuffix + path.extname(file.originalname));
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

// 에디터 이미지 업로드 (글 작성 중 이미지 삽입용)
router.post('/upload-image', editorUpload.single('image'), async (req, res) => {
    try {
        // 인증 확인
        const token = req.cookies.accessToken;
        if (!token) {
            return res.status(401).json({
                success: false,
                message: '인증이 필요합니다.'
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(403).json({
                success: false,
                message: '사용자를 찾을 수 없습니다.'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: '이미지 파일이 없습니다.'
            });
        }

        // 이미지 URL 반환
        const imageUrl = `/uploads/news/editor/${req.file.filename}`;
        
        console.log('📸 에디터 이미지 업로드 성공:', {
            filename: req.file.filename,
            originalName: req.file.originalname,
            url: imageUrl,
            fullPath: req.file.path
        });
        
        res.status(200).json({
            success: true,
            data: {
                url: imageUrl,
                filename: req.file.filename,
                originalName: req.file.originalname,
                size: req.file.size
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
