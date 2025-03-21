import multer from 'multer';
import path from 'path';

// 저장 위치 및 파일명 설정
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // uploads 폴더에 저장 (미리 폴더를 생성해야 함)
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
    fileFilter,
});

export default upload;
