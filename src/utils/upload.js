import multer from 'multer';
import path from 'path';
import fs from 'fs';

// 폴더 생성 함수
const ensureDirectoryExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

// 업로드 타입별 폴더 결정
const getUploadFolder = (req) => {
    const route = req.route?.path || req.url;

    if (route.includes('/subreplies')) {
        return 'uploads/subreplies';
    } else if (route.includes('/replies')) {
        return 'uploads/replies';
    } else if (route.includes('/comments')) {
        return 'uploads/comments';
    } else {
        return 'uploads/posts';
    }
};

// 저장 위치 및 파일명 설정
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folder = getUploadFolder(req);
        ensureDirectoryExists(folder);
        cb(null, folder);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
    },
});

// 파일 타입 필터링 (이미지만 허용)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('이미지 파일만 업로드 가능합니다.'), false);
    }
};

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_, file, cb) => {
        const ok = /jpeg|jpg|png|gif/.test(file.mimetype);
        cb(null, ok);
    }
});

export default upload;  // ← 이 부분이 누락되어 있었습니다!
