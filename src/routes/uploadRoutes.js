//프로필 사진 업로드 라우터
// src/routes/uploadRoutes.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadFile } from '../controllers/uploadController.js';

const router = express.Router();

// ES 모듈 환경에서 __dirname 처리
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// multer 디스크 스토리지 설정: 프로젝트 루트의 uploads 폴더에 저장
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads/'));
    },
    filename: (req, file, cb) => {
        // 현재 타임스탬프와 원본 파일명을 조합해 고유한 파일 이름 생성
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });

// 단일 파일 업로드 (폼 필드 이름: 'file')
router.post('/', upload.single('file'), uploadFile);

export default router;
