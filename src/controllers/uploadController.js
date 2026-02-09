//사진업로드 컨트롤러
// src/controllers/uploadController.js
import path from 'path';
import Upload from '../models/Upload.js';
import sharp from 'sharp';
import fs from 'fs';


export const uploadFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "파일이 업로드되지 않았습니다." });
        }

        const sourcePage = req.sourcePage || null;
        let fileUrl = '';
        let finalFilename = req.file.filename;

        // 이미지 파일인 경우 sharp로 최적화 (WebP 변환)
        if (req.file.mimetype.startsWith('image/')) {
            const originalNameWithoutExt = path.parse(req.file.filename).name;
            const processedFilename = `${originalNameWithoutExt}.webp`;
            const processedImagePath = path.join(req.file.destination, processedFilename);

            await sharp(req.file.path)
                .resize({ width: 1200, withoutEnlargement: true })
                .webp({ quality: 80 })
                .toFile(processedImagePath);

            // 원본 파일 삭제
            try {
                fs.unlinkSync(req.file.path);
            } catch (err) {
                console.error("원본 파일 삭제 실패:", err);
            }

            finalFilename = processedFilename;
            fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.user._id}/${processedFilename}`;
        } else {
            // 이미지가 아닌 경우 원본 URL 사용
            fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.user._id}/${req.file.filename}`;
        }

        // DB에 저장
        const newUpload = await Upload.create({
            user: req.user._id,
            filename: finalFilename,
            url: fileUrl,
            sourcePage,
        });

                return res.status(201).json({

                    success: true,

                    url: newUpload.url

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
            .select('url createdAt sourcePage') // 필요한 필드만 선택
            .sort({ createdAt: -1 })            // 최신 순 정렬
            .lean();

        return res.status(200).json({
            success: true,
            uploads: uploads
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
            .select('url createdAt sourcePage') // 필요한 필드만 선택
            .sort({ createdAt: -1 })
            .lean();
        return res.status(200).json({
            success: true,
            uploads: uploads
        });
    } catch (err) {
        console.error("getUploadsByUser error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};


