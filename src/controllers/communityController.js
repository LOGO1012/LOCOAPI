// src/controllers/communityController.js
import * as communityService from '../services/communityService.js';

// 전체 커뮤니티 목록 조회
export const getCommunities = async (req, res) => {
    try {
        const communities = await communityService.getAllCommunities();
        res.status(200).json(communities);
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

// 커뮤니티 생성
export const createCommunity = async (req, res) => {
    try {
        const communityData = { ...req.body };
        if (req.file) {
            // DB에는 '/uploads/파일명' 형식으로 저장 (백슬래시가 아닌 슬래시 사용)
            communityData.communityImage = `/uploads/${req.file.filename}`;
        }
        const newCommunity = await communityService.createCommunity(communityData);
        res.status(201).json(newCommunity);
    } catch (error) {
        res.status(500).json({ message: '커뮤니티 생성에 실패했습니다.', error });
    }
};

// 커뮤니티 수정
export const updateCommunity = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };
        if (req.file) {
            updateData.communityImage = `/uploads/${req.file.filename}`;
        }
        const updatedCommunity = await communityService.updateCommunity(id, updateData);
        if (!updatedCommunity) {
            return res.status(404).json({ message: '커뮤니티를 찾을 수 없습니다.' });
        }
        res.status(200).json(updatedCommunity);
    } catch (error) {
        res.status(500).json({ message: '커뮤니티 수정에 실패했습니다.', error });
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
