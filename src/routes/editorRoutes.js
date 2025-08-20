import express from 'express';
import multer from 'multer';
import path from 'path';
import { User } from '../models/UserProfile.js';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

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
router.post('/editor-image', editorUpload.single('image'), async (req, res) => {
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
        
        if (!user || user.userLv < 3) {
            return res.status(403).json({
                success: false,
                message: '권한이 부족합니다.'
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
