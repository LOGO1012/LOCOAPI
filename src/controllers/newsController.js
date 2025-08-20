import { News } from '../models/News.js';
import { User } from '../models/UserProfile.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// 사용자 인증 및 권한 확인 헬퍼 함수 (쿠키 기반)
const authenticateAndAuthorize = async (req, requiredLevel = 0) => {
    try {
        // 쿠키에서 accessToken 확인
        const token = req.cookies.accessToken;
        
        if (!token) {
            throw new Error('토큰이 없습니다.');
        }
        
        // 토큰 검증
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }
        
        // 권한 확인
        if (requiredLevel > 0 && user.userLv < requiredLevel) {
            throw new Error('권한이 부족합니다.');
        }
        
        return user;
    } catch (error) {
        throw error;
    }
};

// 현재 사용자 정보 조회 (권한 확인용)
const getCurrentUser = async (req) => {
    try {
        const token = req.cookies.accessToken;
        if (!token) return null;
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        return user;
    } catch (error) {
        return null;
    }
};

// 뉴스 목록 조회 (권한에 따른 필터링)
export const getNewsList = async (req, res) => {
    try {
        const { category, page = 1, limit = 10 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // 현재 사용자 정보 확인
        const currentUser = await getCurrentUser(req);
        const isAdmin = currentUser && currentUser.userLv >= 3;

        // 필터 조건
        const filter = { isDeleted: false }; // 삭제된 글은 완전히 숨김
        
        if (category && ['공지사항', '이벤트'].includes(category)) {
            filter.category = category;
        }

        // 일반 사용자는 활성화된 글만, 관리자는 모든 글 확인 가능
        if (!isAdmin) {
            filter.isActive = true;
        }

        // 중요 공지사항을 먼저, 그 다음 최신순
        const news = await News.find(filter)
            .populate('author', 'nickname profilePhoto userLv')
            .sort({ isImportant: -1, createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        const total = await News.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: {
                news,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(total / limitNum),
                    totalItems: total,
                    hasNextPage: pageNum < Math.ceil(total / limitNum),
                    hasPrevPage: pageNum > 1
                },
                isAdmin // 프론트엔드에서 관리자 UI 표시용
            }
        });
    } catch (error) {
        console.error('뉴스 목록 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '뉴스 목록을 불러오는데 실패했습니다.'
        });
    }
};

// 뉴스 상세 조회 (권한에 따른 접근 제한)
export const getNewsDetail = async (req, res) => {
    try {
        const { id } = req.params;

        // 현재 사용자 정보 확인
        const currentUser = await getCurrentUser(req);
        const isAdmin = currentUser && currentUser.userLv >= 3;

        const news = await News.findById(id)
            .populate('author', 'nickname profilePhoto userLv');

        if (!news || news.isDeleted) {
            return res.status(404).json({
                success: false,
                message: '게시글을 찾을 수 없습니다.'
            });
        }

        // 비활성화된 글은 관리자만 접근 가능
        if (!news.isActive && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: '접근 권한이 없습니다.'
            });
        }

        // 조회수 증가 (활성화된 글이고 일반 사용자일 때만)
        if (news.isActive) {
            await News.findByIdAndUpdate(id, { $inc: { views: 1 } });
            news.views += 1;
        }

        res.status(200).json({
            success: true,
            data: {
                ...news.toObject(),
                isAdmin // 프론트엔드에서 관리자 UI 표시용
            }
        });
    } catch (error) {
        console.error('뉴스 상세 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '게시글을 불러오는데 실패했습니다.'
        });
    }
};

// 뉴스 작성 (개발자 lv3 이상만)
export const createNews = async (req, res) => {
    try {
        const { title, content, category, isImportant } = req.body;

        // 인증 및 권한 확인 (lv3 이상)
        const user = await authenticateAndAuthorize(req, 3);

        // 입력값 검증
        if (!title || !content || !category) {
            return res.status(400).json({
                success: false,
                message: '제목, 내용, 카테고리는 필수입니다.'
            });
        }

        if (!['공지사항', '이벤트'].includes(category)) {
            return res.status(400).json({
                success: false,
                message: '올바른 카테고리를 선택해주세요.'
            });
        }

        // 업로드된 이미지 처리
        const images = req.files ? req.files.map(file => ({
            filename: file.filename,
            originalName: file.originalname,
            path: file.path,
            size: file.size
        })) : [];

        const news = new News({
            title,
            content,
            category,
            author: user._id,
            authorNickname: user.nickname,
            images,
            isImportant: isImportant === 'true' || isImportant === true
        });

        await news.save();

        res.status(201).json({
            success: true,
            message: '게시글이 성공적으로 작성되었습니다.',
            data: news
        });
    } catch (error) {
        console.error('뉴스 작성 오류:', error);
        
        if (error.message === '토큰이 없습니다.' || error.message === '사용자를 찾을 수 없습니다.') {
            return res.status(401).json({
                success: false,
                message: '인증이 필요합니다.'
            });
        }
        
        if (error.message === '권한이 부족합니다.') {
            return res.status(403).json({
                success: false,
                message: '개발자 권한이 필요합니다.'
            });
        }
        
        res.status(500).json({
            success: false,
            message: '게시글 작성에 실패했습니다.'
        });
    }
};

// 뉴스 수정 (개발자 lv3 이상만)
export const updateNews = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, category, isImportant, isActive } = req.body;

        // 인증 및 권한 확인 (lv3 이상)
        const user = await authenticateAndAuthorize(req, 3);

        const news = await News.findById(id);
        if (!news || news.isDeleted) {
            return res.status(404).json({
                success: false,
                message: '게시글을 찾을 수 없습니다.'
            });
        }

        // 업데이트
        const updateData = {
            ...(title && { title }),
            ...(content && { content }),
            ...(category && { category }),
            ...(typeof isImportant !== 'undefined' && { isImportant }),
            ...(typeof isActive !== 'undefined' && { isActive }),
            updatedAt: new Date()
        };

        // 새 이미지가 업로드된 경우
        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(file => ({
                filename: file.filename,
                originalName: file.originalname,
                path: file.path,
                size: file.size
            }));
            updateData.images = [...news.images, ...newImages];
        }

        const updatedNews = await News.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        ).populate('author', 'nickname profilePhoto userLv');

        res.status(200).json({
            success: true,
            message: '게시글이 성공적으로 수정되었습니다.',
            data: updatedNews
        });
    } catch (error) {
        console.error('뉴스 수정 오류:', error);
        
        if (error.message === '토큰이 없습니다.' || error.message === '사용자를 찾을 수 없습니다.') {
            return res.status(401).json({
                success: false,
                message: '인증이 필요합니다.'
            });
        }
        
        if (error.message === '권한이 부족합니다.') {
            return res.status(403).json({
                success: false,
                message: '개발자 권한이 필요합니다.'
            });
        }
        
        res.status(500).json({
            success: false,
            message: '게시글 수정에 실패했습니다.'
        });
    }
};

// 뉴스 삭제 (소프트 삭제 - isDeleted를 true로 변경)
export const deleteNews = async (req, res) => {
    try {
        const { id } = req.params;

        // 인증 및 권한 확인 (lv3 이상)
        const user = await authenticateAndAuthorize(req, 3);

        const news = await News.findByIdAndUpdate(
            id,
            { 
                isDeleted: true, 
                updatedAt: new Date() 
            },
            { new: true }
        );

        if (!news) {
            return res.status(404).json({
                success: false,
                message: '게시글을 찾을 수 없습니다.'
            });
        }

        res.status(200).json({
            success: true,
            message: '게시글이 성공적으로 삭제되었습니다.'
        });
    } catch (error) {
        console.error('뉴스 삭제 오류:', error);
        
        if (error.message === '토큰이 없습니다.' || error.message === '사용자를 찾을 수 없습니다.') {
            return res.status(401).json({
                success: false,
                message: '인증이 필요합니다.'
            });
        }
        
        if (error.message === '권한이 부족합니다.') {
            return res.status(403).json({
                success: false,
                message: '개발자 권한이 필요합니다.'
            });
        }
        
        res.status(500).json({
            success: false,
            message: '게시글 삭제에 실패했습니다.'
        });
    }
};
