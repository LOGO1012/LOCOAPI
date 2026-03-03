import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { fileTypeFromFile } from 'file-type';

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
        // H-13 보안 조치: originalname 대신 UUID 사용 (경로 탐색 방지)
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
        cb(null, `${uuid()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter,
});

// H-07 보안 조치: 매직바이트 검증 미들웨어
// multer 이후에 배치하여 디스크에 저장된 파일의 실제 타입을 검증
export const validateImageMagicBytes = async (req, res, next) => {
    // single upload (req.file) 또는 array upload (req.files) 처리
    const files = req.files || (req.file ? [req.file] : []);
    if (files.length === 0) return next();

    for (const file of files) {
        try {
            const type = await fileTypeFromFile(file.path);
            if (!type || !type.mime.startsWith('image/')) {
                // 위조 파일 삭제
                for (const f of files) {
                    try { fs.unlinkSync(f.path); } catch {}
                }
                return res.status(400).json({
                    message: '허용되지 않는 파일 형식입니다. 실제 이미지 파일만 업로드 가능합니다.'
                });
            }
        } catch {
            for (const f of files) {
                try { fs.unlinkSync(f.path); } catch {}
            }
            return res.status(400).json({
                message: '파일 검증 중 오류가 발생했습니다.'
            });
        }
    }
    next();
};

export default upload;
