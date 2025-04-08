//사진업로드 컨트롤러
// src/controllers/uploadController.js
import path from 'path';

export const uploadFile = (req, res) => {
    // multer가 추가한 req.file 속성에 파일 정보가 들어 있습니다.
    if (!req.file) {
        return res.status(400).json({ success: false, message: "파일이 업로드되지 않았습니다." });
    }
    // 예시: 서버에서 uploads 폴더를 static 파일로 제공한다고 가정합니다.
    // URL 예시: http://localhost:3000/uploads/파일이름
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.status(200).json({ success: true, url: fileUrl });
};
