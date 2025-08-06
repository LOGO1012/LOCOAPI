// src/controllers/communityController.js
import PageRequestDTO from '../../src/dto/common/PageRequestDTO.js'; // 파일 경로를 실제 경로에 맞게 수정하세요.
import * as communityService from '../services/communityService.js';
import {saveRemoteImage} from "../utils/saveRemoteImage.js";

export const getCommunities = async (req, res) => {
    try {
        const page = req.query.page ? parseInt(req.query.page) : 1;
        const size = req.query.size ? parseInt(req.query.size) : 10;
        const category = req.query.category || '전체';
        const userId = req.query.userId;
        const sort = req.query.sort || '최신순';
        const keyword = req.query.keyword || '';  // 추가
        const searchType = req.query.searchType     || 'title+content';

        const pageRequestDTO = new PageRequestDTO(page, size);
        const pageResult = await communityService.getCommunitiesPage(
            pageRequestDTO,
            category,
            userId,
            sort,
            keyword,
            searchType
        );
        res.status(200).json(pageResult);
    } catch (error) {
        res.status(500).json({ message: '커뮤니티 목록 조회에 실패했습니다.', error });
    }
};




// 단일 커뮤니티 상세 조회 (조회수 증가 포함)
export const getCommunity = async (req, res) => {
    try {
        const { id } = req.params;
        // 조회수 증가
        const updatedCommunity = await communityService.incrementViews(id);
        if (!updatedCommunity) {
            return res.status(404).json({ message: '커뮤니티를 찾을 수 없습니다.' });
        }
        res.status(200).json(updatedCommunity);
    } catch (error) {
        res.status(500).json({ message: '커뮤니티 조회에 실패했습니다.', error });
    }
};

/* 공통 유틸: multipart 파일 + URL 문자열을 모두 받아 배열로 만든다 */
const buildImageArray = async (req) => {
    const fromUpload = (req.files || []).map(f => `/uploads/${f.filename}`);

    // 문자열 입력(배열·단일 모두 허용)
    const raw = req.body.communityImages || [];
    const urls = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);

    const downloaded = [];
    for (const u of urls) {
        const saved = await saveRemoteImage(u);
        if (saved) downloaded.push(saved);
    }
    return [...fromUpload, ...downloaded];
};

// 커뮤니티 생성
export const createCommunity = async (req, res) => {
    try {
        const data = { ...req.body };
        data.communityImages = await buildImageArray(req);     // ✅ 핵심
        const created = await communityService.createCommunity(data);
        res.status(201).json(created);
    } catch (err) {
        res.status(500).json({ message: '글 생성 실패', err });
    }
};

// 커뮤니티 수정
export const updateCommunity = async (req, res) => {
    try {
        const { id } = req.params;
        const data = { ...req.body };
        data.communityImages = await buildImageArray(req);     // 파일·URL 둘 다 반영
        const updated = await communityService.updateCommunity(id, data);
        if (!updated) return res.status(404).json({ message: '존재하지 않는 글' });
        res.status(200).json(updated);
    } catch (err) {
        res.status(500).json({ message: '글 수정 실패', err });
    }
};

// 커뮤니티 삭제
export const deleteCommunity = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedCommunity = await communityService.deleteCommunity(id);
        if (!deletedCommunity) {
            return res.status(404).json({ message: '커뮤니티를 찾을 수 없습니다.' });
        }
        res.status(200).json({ message: '커뮤니티가 삭제되었습니다.' });
    } catch (error) {
        res.status(500).json({ message: '커뮤니티 삭제에 실패했습니다.', error });
    }
};

// 추천 처리 (사용자별 한 번만 추천)
export const recommendCommunity = async (req, res) => {
    try {
        const { id } = req.params;
        // 예시로 req.body.userId를 사용 (실제 구현 시 인증 미들웨어로부터 사용자 아이디를 가져옴)
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ message: '사용자 정보가 필요합니다.' });
        }
        const updatedCommunity = await communityService.recommendCommunity(id, userId);
        res.status(200).json(updatedCommunity);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const cancelRecommendCommunity = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ message: '사용자 정보가 필요합니다.' });
        }
        const updatedCommunity = await communityService.cancelRecommendCommunity(id, userId);
        res.status(200).json(updatedCommunity);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// 댓글 추가 컨트롤러
export const addComment = async (req, res) => {
    try {
        const { id } = req.params; // 커뮤니티 ID
        const commentData = { ...req.body };
        if (req.file) {
            commentData.commentImage = `/uploads/${req.file.filename}`;
        }
        const updatedCommunity = await communityService.addComment(id, commentData);
        res.status(200).json(updatedCommunity);
    } catch (error) {
        res.status(500).json({ message: '댓글 추가에 실패했습니다.', error });
    }
};

// 대댓글 추가 컨트롤러 (사진 첨부 지원)
export const addReply = async (req, res) => {
    try {
        const { id, commentId } = req.params; // id: 커뮤니티 ID, commentId: 댓글 ID
        // req.body에 { userId, commentContents }가 포함되어 있다고 가정
        const replyData = { ...req.body };
        if (req.file) {
            // 업로드된 파일이 있으면, '/uploads/파일명' 형식으로 저장
            replyData.replyImage = `/uploads/${req.file.filename}`;
        }
        const updatedCommunity = await communityService.addReply(id, commentId, replyData);
        res.status(200).json(updatedCommunity);
    } catch (error) {
        res.status(500).json({ message: '대댓글 추가에 실패했습니다.', error });
    }
};

// 대대댓글 추가 컨트롤러 (사진 첨부 지원)
export const addSubReply = async (req, res) => {
    try {
        const { id, commentId, replyId } = req.params; // id: 커뮤니티 ID, commentId: 댓글 ID, replyId: 대댓글 ID
        const subReplyData = { ...req.body };
        if (req.file) {
            subReplyData.subReplyImage = `/uploads/${req.file.filename}`;
        }
        const updatedCommunity = await communityService.addSubReply(id, commentId, replyId, subReplyData);
        res.status(200).json(updatedCommunity);
    } catch (error) {
        res.status(500).json({ message: '대대댓글 추가에 실패했습니다.', error });
    }
};

export const deleteComment = async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const updatedCommunity = await communityService.deleteComment(id, commentId);
        if (!updatedCommunity) {
            return res.status(404).json({ message: '댓글을 찾을 수 없습니다.' });
        }
        res.status(200).json(updatedCommunity);
    } catch (error) {
        res.status(500).json({ message: '댓글 삭제에 실패했습니다.', error });
    }
};

export const deleteReply = async (req, res) => {
    try {
        const { id, commentId, replyId } = req.params;
        const updatedCommunity = await communityService.deleteReply(id, commentId, replyId);
        if (!updatedCommunity) {
            return res.status(404).json({ message: '대댓글을 찾을 수 없습니다.' });
        }
        res.status(200).json(updatedCommunity);
    } catch (error) {
        res.status(500).json({ message: '대댓글 삭제에 실패했습니다.', error });
    }
};

export const deleteSubReply = async (req, res) => {
    try {
        const { id, commentId, replyId, subReplyId } = req.params;
        const updatedCommunity = await communityService.deleteSubReply(id, commentId, replyId, subReplyId);
        if (!updatedCommunity) {
            return res.status(404).json({ message: '대대댓글을 찾을 수 없습니다.' });
        }
        res.status(200).json(updatedCommunity);
    } catch (error) {
        res.status(500).json({ message: '대대댓글 삭제에 실패했습니다.', error });
    }
};

// 최다 조회 목록 API 엔드포인트
export const getTopViewed = async (req, res) => {
    try {
        const topViewed = await communityService.getTopViewedCommunities();
        res.status(200).json(topViewed);
    } catch (error) {
        res.status(500).json({ message: "최다 조회 목록을 불러오는 데 실패했습니다.", error });
    }
};

// 최다 댓글 목록 API 엔드포인트
export const getTopCommented = async (req, res) => {
    try {
        const topCommented = await communityService.getTopCommentedCommunities();
        res.status(200).json(topCommented);
    } catch (error) {
        res.status(500).json({ message: "최다 댓글 목록을 불러오는 데 실패했습니다.", error });
    }
};


