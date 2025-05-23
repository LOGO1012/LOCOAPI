// src/routes/communityRoutes.js
import express from 'express';
import * as communityController from '../controllers/communityController.js';
import upload from "../utils/upload.js";

const router = express.Router();

// 전체 커뮤니티 목록 조회
router.get('', communityController.getCommunities);

// 커뮤니티 생성 (이미지 업로드 처리 미들웨어 추가)
// 클라이언트는 'communityImage' 필드명으로 파일을 전송합니다.
router.post('', upload.single('communityImage'), communityController.createCommunity);

// 최다 조회 및 최다 댓글 엔드포인트 추가
router.get('/top-viewed', communityController.getTopViewed);
router.get('/top-commented', communityController.getTopCommented);

// 단일 커뮤니티 상세 조회 (조회수 증가 포함)
router.get('/:id', communityController.getCommunity);

// 커뮤니티 수정
// update 요청에 대해 upload.single('communityImage') 미들웨어 추가
router.put('/:id', upload.single('communityImage'), communityController.updateCommunity);

// 커뮤니티 삭제
router.delete('/:id', communityController.deleteCommunity);

// 추천 처리 엔드포인트 (POST /api/communities/:id/recommend)
router.post('/:id/recommend', communityController.recommendCommunity);

// 추천 취소 엔드포인트 추가
router.delete('/:id/recommend', communityController.cancelRecommendCommunity);

// 댓글 추가 엔드포인트 (commentImage 파일 업로드 처리)
router.post('/:id/comments', upload.single('commentImage'), communityController.addComment);

// 대댓글 추가 엔드포인트 (reply 사진 업로드를 위해 'replyImage' 필드 사용)
router.post('/:id/comments/:commentId/replies', upload.single('replyImage'), communityController.addReply);

// **대대댓글 추가 엔드포인트 (subReply 사진 업로드 처리)**
router.post('/:id/comments/:commentId/replies/:replyId/subreplies', upload.single('subReplyImage'), communityController.addSubReply);

// 댓글 삭제: DELETE /api/communities/:id/comments/:commentId
router.delete('/:id/comments/:commentId', communityController.deleteComment);

// 대댓글 삭제: DELETE /api/communities/:id/comments/:commentId/replies/:replyId
router.delete('/:id/comments/:commentId/replies/:replyId', communityController.deleteReply);

// 대대댓글 삭제: DELETE /api/communities/:id/comments/:commentId/replies/:replyId/subreplies/:subReplyId
router.delete('/:id/comments/:commentId/replies/:replyId/subreplies/:subReplyId', communityController.deleteSubReply);


export default router;
