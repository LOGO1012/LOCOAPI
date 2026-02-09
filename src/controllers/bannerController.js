import { Banner } from '../models/Banner.js';
import { User } from '../models/UserProfile.js';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// 사용자 인증 및 권한 확인 헬퍼 함수 (관리자 권한 lv2 이상)
const authenticateAndAuthorize = async (req, requiredLevel = 2) => {
    try {
        const token = req.cookies.accessToken;
        
        if (!token) {
            throw new Error('토큰이 없습니다.');
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }
        
        if (requiredLevel > 0 && user.userLv < requiredLevel) {
            throw new Error('권한이 부족합니다.');
        }
        
        return user;
    } catch (error) {
        throw error;
    }
};

// 활성 배너 목록 조회 (공개용 - 메인페이지)
export const getActiveBanners = async (req, res) => {
    try {
        const banners = await Banner.find({ isActive: true })
            .sort({ order: 1, createdAt: -1 })
            .select('title description image.path linkUrl')
            .lean();

        res.status(200).json({
            success: true,
            data: banners
        });
    } catch (error) {
        console.error('활성 배너 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '배너를 불러오는데 실패했습니다.'
        });
    }
};

// 모든 배너 목록 조회 (관리자용)
export const getAllBanners = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const banners = await Banner.find()
            .sort({ order: 1, createdAt: -1 })
            .select(
                '_id title image.path isActive order description author createdAt views linkUrl'
            )
            .populate('author', 'nickname')
            .skip(skip)
            .limit(limitNum)
            .lean();

        const total = await Banner.countDocuments();

        res.status(200).json({
            success: true,
            data: {
                banners,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(total / limitNum),
                    totalItems: total,
                    hasNextPage: pageNum < Math.ceil(total / limitNum),
                    hasPrevPage: pageNum > 1
                }
            }
        });
    } catch (error) {
        console.error('배너 목록 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '배너 목록을 불러오는데 실패했습니다.'
        });
    }
};

// 배너 상세 조회
export const getBannerDetail = async (req, res) => {
    try {
        const { id } = req.params;

        const banner = await Banner.findById(id)
            .select('title description linkUrl order isActive image');

        if (!banner) {
            return res.status(404).json({
                success: false,
                message: '배너를 찾을 수 없습니다.'
            });
        }

        res.status(200).json({
            success: true,
            data: banner
        });
    } catch (error) {
        console.error('배너 상세 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '배너를 불러오는데 실패했습니다.'
        });
    }
};

// 배너 생성 (관리자 lv2 이상)
export const createBanner = async (req, res) => {
    try {
        const { title, description, linkUrl, order } = req.body;

        // 인증 및 권한 확인 (lv2 이상)
        const user = await authenticateAndAuthorize(req, 2);

        // 입력값 검증
        if (!title) {
            return res.status(400).json({
                success: false,
                message: '제목은 필수입니다.'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: '배너 이미지는 필수입니다.'
            });
        }

        // 이미지 정보 처리 (WebP 변환 추가)
        const originalNameWithoutExt = path.parse(req.file.filename).name;
        const processedFilename = `${originalNameWithoutExt}.webp`;
        // 배너 업로드 경로는 'uploads/banners/'
        const processedImagePath = path.join('uploads', 'banners', processedFilename);

        await sharp(req.file.path)
            // 배너는 보통 크기가 크므로 1920px 정도로 제한하거나, 원본 비율 유지
            .resize({ width: 1920, withoutEnlargement: true }) 
            .webp({ quality: 85 }) // 배너는 품질이 중요하므로 85
            .toFile(processedImagePath);

        // 원본 파일 삭제
        try {
            fs.unlinkSync(req.file.path);
        } catch (err) {
            console.error("원본 파일 삭제 실패:", err);
        }

        const image = {
            filename: processedFilename,
            originalName: req.file.originalname,
            path: `uploads/banners/${processedFilename}`, // 정적 파일 서빙 경로와 일치
            size: fs.statSync(processedImagePath).size
        };

        const banner = new Banner({
            title,
            description,
            image,
            linkUrl: linkUrl || '',
            order: parseInt(order) || 0,
            author: user._id
        });

        await banner.save();

        res.status(201).json({
            success: true,
            message: '배너가 성공적으로 생성되었습니다.',
        });
    } catch (error) {
        console.error('배너 생성 오류:', error);
        
        if (error.message === '토큰이 없습니다.' || error.message === '사용자를 찾을 수 없습니다.') {
            return res.status(401).json({
                success: false,
                message: '인증이 필요합니다.'
            });
        }
        
        if (error.message === '권한이 부족합니다.') {
            return res.status(403).json({
                success: false,
                message: '관리자 권한이 필요합니다.'
            });
        }
        
        res.status(500).json({
            success: false,
            message: '배너 생성에 실패했습니다.'
        });
    }
};

// 배너 수정 (관리자 lv2 이상)
export const updateBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, linkUrl, order, isActive } = req.body;

        // 인증 및 권한 확인 (lv2 이상)
        const user = await authenticateAndAuthorize(req, 2);

        const banner = await Banner.findById(id);
        if (!banner) {
            return res.status(404).json({
                success: false,
                message: '배너를 찾을 수 없습니다.'
            });
        }

        // 업데이트 데이터
        const updateData = {
            ...(title && { title }),
            ...(description !== undefined && { description }),
            ...(linkUrl !== undefined && { linkUrl }),
            ...(order !== undefined && { order: parseInt(order) }),
            ...(typeof isActive !== 'undefined' && { isActive }),
            updatedAt: new Date()
        };

        // 새 이미지가 업로드된 경우
        if (req.file) {
            // 이미지 정보 처리 (WebP 변환 추가)
            const originalNameWithoutExt = path.parse(req.file.filename).name;
            const processedFilename = `${originalNameWithoutExt}.webp`;
            // 배너 업로드 경로는 'uploads/banners/'
            const processedImagePath = path.join('uploads', 'banners', processedFilename);

            await sharp(req.file.path)
                .resize({ width: 1920, withoutEnlargement: true }) 
                .webp({ quality: 85 })
                .toFile(processedImagePath);

            // 원본 파일 삭제
            try {
                fs.unlinkSync(req.file.path);
            } catch (err) {
                console.error("원본 파일 삭제 실패:", err);
            }

            updateData.image = {
                filename: processedFilename,
                originalName: req.file.originalname,
                path: `uploads/banners/${processedFilename}`, // 정적 파일 서빙 경로와 일치
                size: fs.statSync(processedImagePath).size
            };
        }

        await Banner.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        );

        res.status(200).json({
            success: true,
            message: '배너가 성공적으로 수정되었습니다.',
        });
    } catch (error) {
        console.error('배너 수정 오류:', error);
        
        if (error.message === '토큰이 없습니다.' || error.message === '사용자를 찾을 수 없습니다.') {
            return res.status(401).json({
                success: false,
                message: '인증이 필요합니다.'
            });
        }
        
        if (error.message === '권한이 부족합니다.') {
            return res.status(403).json({
                success: false,
                message: '관리자 권한이 필요합니다.'
            });
        }
        
        res.status(500).json({
            success: false,
            message: '배너 수정에 실패했습니다.'
        });
    }
};

// 배너 삭제 (관리자 lv2 이상)
export const deleteBanner = async (req, res) => {
    try {
        const { id } = req.params;

        // 인증 및 권한 확인 (lv2 이상)
        const user = await authenticateAndAuthorize(req, 2);

        const banner = await Banner.findByIdAndDelete(id);

        if (!banner) {
            return res.status(404).json({
                success: false,
                message: '배너를 찾을 수 없습니다.'
            });
        }

        res.status(200).json({
            success: true,
            message: '배너가 성공적으로 삭제되었습니다.'
        });
    } catch (error) {
        console.error('배너 삭제 오류:', error);
        
        if (error.message === '토큰이 없습니다.' || error.message === '사용자를 찾을 수 없습니다.') {
            return res.status(401).json({
                success: false,
                message: '인증이 필요합니다.'
            });
        }
        
        if (error.message === '권한이 부족합니다.') {
            return res.status(403).json({
                success: false,
                message: '관리자 권한이 필요합니다.'
            });
        }
        
        res.status(500).json({
            success: false,
            message: '배너 삭제에 실패했습니다.'
        });
    }
};

// 배너 클릭 수 증가
export const incrementBannerViews = async (req, res) => {
    try {
        const { id } = req.params;

        await Banner.findByIdAndUpdate(
            id,
            { $inc: { views: 1 } }
        );

        res.status(200).json({
            success: true,
            message: '조회수가 증가되었습니다.'
        });
    } catch (error) {
        console.error('배너 조회수 증가 오류:', error);
        res.status(500).json({
            success: false,
            message: '조회수 증가에 실패했습니다.'
        });
    }
};
