//사진업로드 컨트롤러
// src/controllers/uploadController.js
import path from 'path';
import Upload from '../models/Upload.js';


export const uploadFile = async (req, res) => {
    try {
        // multer가 처리한 파일 정보
        if (!req.file) {
            return res.status(400).json({ success: false, message: "파일이 업로드되지 않았습니다." });
        }

        // 업로드 출처 페이지 정보 (routes에서 설정)
        const sourcePage = req.sourcePage || null;

        // 접근 가능한 URL 생성
        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.user._id}/${req.file.filename}`;

        // DB에 저장
        const newUpload = await Upload.create({
            user:       req.user._id,
            filename:   req.file.filename,
            url:        fileUrl,
            sourcePage,                  // 저장한 페이지 정보
        });

        return res.status(201).json({
            success: true,
            upload: {
                id:         newUpload._id,
                filename:   newUpload.filename,
                url:        newUpload.url,
                uploadedAt: newUpload.createdAt,
                sourcePage: newUpload.sourcePage
            }
        });

    } catch (error) {
        console.error("uploadFile error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /uploads/me
 * 로그인한 사용자가 올린 모든 사진의 메타데이터를 반환
 */
export const getMyUploads = async (req, res) => {
    try {
        // 인증 미들웨어로부터 req.user._id가 들어온 상태
        const uploads = await Upload.find({ user: req.user._id })
            .sort({ createdAt: -1 });            // 최신 순 정렬

        return res.status(200).json({
            success: true,
            uploads: uploads.map(u => ({
                id:         u._id,
                filename:   u.filename,
                url:        u.url,
                uploadedAt: u.createdAt,
                sourcePage: u.sourcePage
            }))
        });
    } catch (error) {
        console.error("getMyUploads error:", error);
        res.status(500).json({ success: false, message: '조회 중 오류 발생' });
    }
};


export const getUploadsByUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const uploads = await Upload.find({ user: userId })
            .sort({ createdAt: -1 });
        return res.status(200).json({
            success: true,
            uploads: uploads.map(u => ({
                filename:   u.filename,
                url:        u.url,
                uploadedAt: u.createdAt,
                sourcePage: u.sourcePage
            }))
        });
    } catch (err) {
        console.error("getUploadsByUser error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};


