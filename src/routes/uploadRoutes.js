//프로필 사진 업로드 라우터
// src/routes/uploadRoutes.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import {getMyUploads, getUploadsByUser, uploadFile} from '../controllers/uploadController.js';
import {authenticate} from "../middlewares/authMiddleware.js";
import * as fs from "node:fs";
import {requireLevel} from "../middlewares/requireLevel.js";

const router = express.Router();

// ES 모듈 환경에서 __dirname 처리
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// multer 디스크 스토리지 설정: 프로젝트 루트의 uploads 폴더에 저장
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../../uploads', String(req.user._id));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${req.user._id}-${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

// 파일 업로드
router.post(
    '/',
    authenticate,

    upload.single('file'),
    (req, res, next) => {
        // 클라이언트가 명시한 sourcePage 우선, 없으면 Referer 헤더 활용
        req.sourcePage = req.body.sourcePage || req.get('Referer') || null;
        next();
    },
    uploadFile
);
// 내 업로드 조회
router.get(
    '/me',
    authenticate,               // 토큰 검증 후 req.user 보장
    getMyUploads                // DB에서 해당 사용자 업로드 목록 반환
);
//이 코드 작성된 이하의 코드들한테 적용됨
router.use(
    authenticate,       // JWT 인증 검사
    requireLevel(2)     // userLv ≥ 2
);
router.get(
    '/:userId',
    authenticate,           // (관리자 권한 체크가 필요하다면 추가 미들웨어 삽입)
    getUploadsByUser
);

export default router;
