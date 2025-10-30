// src/routes/communityRoutes.js
import express from 'express';
import * as communityController from '../controllers/communityController.js';
import upload from "../utils/upload.js";

const router = express.Router();

// 전체 커뮤니티 목록 조회
router.get('', communityController.getCommunities);

// 커뮤니티 생성 (이미지 업로드 처리 미들웨어 추가)
// 클라이언트는 'communityImage' 필드명으로 파일을 전송합니다.
router.post('', upload.array('communityImages', 5), communityController.createCommunity); // 최대 5장

// 최다 조회 및 최다 댓글 엔드포인트 추가
router.get('/top-viewed', communityController.getTopViewed);
router.get('/top-commented', communityController.getTopCommented);

// 단일 커뮤니티 상세 조회 (조회수 증가 포함)
router.get('/:id', communityController.getCommunity);

// 커뮤니티 편집 데이터 조회
router.get('/:id/edit', communityController.getCommunityForEdit);

// 커뮤니티 수정
router.put('/:id', upload.array('communityImages', 5), communityController.updateCommunity);

// 커뮤니티 삭제
router.delete('/:id', communityController.deleteCommunity);

// 추천 처리 엔드포인트 (POST /api/communities/:id/recommend)
router.post('/:id/recommend', communityController.recommendCommunity);

// 추천 취소 엔드포인트 추가
router.delete('/:id/recommend', communityController.cancelRecommendCommunity);

router.get('/:id/comments', communityController.getComments);

router.get('/comments/:commentId/replies', communityController.getReplies);

router.get('/replies/:replyId/subreplies', communityController.getSubReplies);

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

// 투표 생성
router.post('/:id/polls', communityController.createPoll);

// 투표하기
router.post('/:id/polls/:pollId/vote', communityController.votePoll);





// 투표 삭제
router.delete('/:id/polls/:pollId', communityController.deletePoll);

router.post('/:id/polls/:pollId/cancel-vote', communityController.cancelVote);

// 댓글 투표 생성
router.post('/comments/:commentId/polls', communityController.createCommentPoll);

// 댓글 투표 참여
router.post('/comments/:commentId/polls/:pollId/vote', communityController.voteCommentPoll);

// 댓글 투표 결과 조회
router.get('/comments/:commentId/polls/:pollId/results', communityController.getCommentPollResults);

// 댓글 투표 상태 확인
router.get('/comments/:commentId/polls/:pollId/status', communityController.getCommentUserVoteStatus);

// 댓글 투표 취소
router.post('/comments/:commentId/polls/:pollId/cancel-vote', communityController.cancelCommentVote);

// 댓글 투표 삭제
router.delete('/comments/:commentId/polls/:pollId', communityController.deleteCommentPoll);

export default router;
