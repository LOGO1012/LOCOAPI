// src/controllers/communityController.js
import PageRequestDTO from '../../src/dto/common/PageRequestDTO.js';
import {User} from "../models/UserProfile.js";
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
        const period = req.query.period || '전체';

        const pageRequestDTO = new PageRequestDTO(page, size);
        const pageResult = await communityService.getCommunitiesPage(
            pageRequestDTO,
            category,
            userId,
            sort,
            keyword,
            searchType,
            period
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

export const getCommunityForEdit = async (req, res) => {
    try {
        const { id } = req.params;
        const community = await communityService.getCommunityForEdit(id);
        if (!community) {
            return res.status(404).json({ message: '커뮤니티를 찾을 수 없습니다.' });
        }
        res.status(200).json(community);
    } catch (error) {
        res.status(500).json({ message: '커뮤니티 편집 정보를 불러오는 데 실패했습니다.', error });
    }
};

/* 이미지 경로 타입 판별 함수 */
const isLocalImagePath = (path) => {
    if (!path || typeof path !== 'string') return false;

    // 로컬 이미지 경로 패턴들
    const localPatterns = [
        '/uploads/',
        '/posts/',
        '/comments/',
        '/replies/',
        '/subreplies/',
        'uploads/',
        'posts/',
        'comments/',
        'replies/',
        'subreplies/'
    ];

    return localPatterns.some(pattern => path.startsWith(pattern));
};

/* 공통 유틸: multipart 파일 + URL 문자열을 모두 받아 배열로 만든다 */
const buildImageArray = async (req, folderType = 'posts') => {

    const fromUpload = (req.files || []).map(f => `/${folderType}/${f.filename}`);

    const raw = req.body.communityImages || [];
    const urls = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);

    const processed = [];

    for (const u of urls) {
        console.log(`처리 중인 이미지: ${u}`);

        if (isLocalImagePath(u)) {
            // 기존 로컬 이미지는 그대로 유지
            const normalizedPath = u.startsWith('/') ? u : `/${u}`;
            processed.push(normalizedPath);
            console.log(`기존 이미지로 처리: ${normalizedPath}`);
        } else if (u.startsWith('http') || u.startsWith('//') || u.startsWith('data:')) {
            // 외부 URL이나 Data URL만 다운로드 처리
            try {
                console.log(`외부 이미지 다운로드 시도: ${u}`);
                const saved = await saveRemoteImage(u, folderType);
                if (saved) {
                    processed.push(saved);
                    console.log(`다운로드 성공: ${saved}`);
                }
            } catch (error) {
                console.error(`이미지 다운로드 실패 (${u}):`, error.message);
                // 다운로드 실패한 이미지는 무시하고 계속 진행
            }
        } else {
            console.warn(`알 수 없는 이미지 형식: ${u}`);
        }
    }

    const result = [...fromUpload, ...processed];

    return result;
};
// 커뮤니티 생성
export const createCommunity = async (req, res) => {
    try {
        const data = { ...req.body };

        // ✅ 익명 여부 처리
        data.isAnonymous = req.body.isAnonymous === 'true' || req.body.isAnonymous === true;

        data.communityImages = await buildImageArray(req);
        const created = await communityService.createCommunity(data);
        res.status(201).json(created);
    } catch (err) {
        // 서비스에서 보낸 특정 에러 메시지를 사용하고, 상태 코드를 400으로 변경
        res.status(400).json({ message: err.message });
    }
};

// 커뮤니티 수정
export const updateCommunity = async (req, res) => {
    try {
        const { id } = req.params;
        const data = { ...req.body };

        // ✅ 익명 여부 처리
        data.isAnonymous = req.body.isAnonymous === 'true' || req.body.isAnonymous === true;

        data.communityImages = await buildImageArray(req);
        const updated = await communityService.updateCommunity(id, data);
        if (!updated) return res.status(404).json({ message: '존재하지 않는 글' });
        res.status(200).json(updated);
    } catch (err) {
        // 서비스에서 보낸 특정 에러 메시지를 사용하고, 상태 코드를 400으로 변경
        res.status(400).json({ message: err.message });
    }
};

// 커뮤니티 삭제
// 삭제 관련 응답 메시지 수정
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
    console.log('addComment called with id:', req.params.id);
    console.log('commentData:', req.body);
    try {
        const { id } = req.params;
        const commentData = { ...req.body };
        commentData.isAnonymous = req.body.isAnonymous === 'true' || req.body.isAnonymous === true;

        if (req.file) {
            commentData.commentImage = `/comments/${req.file.filename}`; // 수정됨
        }

        const createdComment = await communityService.addComment(id, commentData);
        res.status(200).json(createdComment);
    } catch (error) {
        res.status(500).json({ message: '댓글 추가에 실패했습니다.', error });
    }
};

// 대댓글 추가 컨트롤러 (사진 첨부 지원)
export const addReply = async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const replyData = { ...req.body };
        replyData.isAnonymous = req.body.isAnonymous === 'true' || req.body.isAnonymous === true;

        if (req.file) {
            replyData.replyImage = `/replies/${req.file.filename}`; // 수정됨
        }

        const updatedComment = await communityService.addReply(commentId, replyData);
        res.status(200).json(updatedComment);
    } catch (error) {
        res.status(500).json({ message: '대댓글 추가에 실패했습니다.', error });
    }
};

// 대대댓글 추가 컨트롤러
export const addSubReply = async (req, res) => {
    try {
        const { id, commentId, replyId } = req.params;
        const subReplyData = { ...req.body };
        subReplyData.isAnonymous = req.body.isAnonymous === 'true' || req.body.isAnonymous === true;

        if (req.file) {
            subReplyData.subReplyImage = `/subreplies/${req.file.filename}`; // 수정됨
        }

        const updatedSubReply = await communityService.addSubReply(replyId, subReplyData);
        res.status(200).json(updatedSubReply);
    } catch (error) {
        res.status(500).json({ message: '대대댓글 추가에 실패했습니다.', error });
    }
};

export const deleteComment = async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const updatedComment = await communityService.deleteComment(commentId);
        if (!updatedComment) {
            return res.status(404).json({ message: '댓글을 찾을 수 없습니다.' });
        }
        res.status(200).json(updatedComment);
    } catch (error) {
        res.status(500).json({ message: '댓글 삭제에 실패했습니다.', error });
    }
};

export const deleteReply = async (req, res) => {
    try {
        const { id, commentId, replyId } = req.params;
        const updatedReply = await communityService.deleteReply(replyId);
        if (!updatedReply) {
            return res.status(404).json({ message: '대댓글을 찾을 수 없습니다.' });
        }
        res.status(200).json(updatedReply);
    } catch (error) {
        res.status(500).json({ message: '대댓글 삭제에 실패했습니다.', error });
    }
};

export const deleteSubReply = async (req, res) => {
    try {
        const { commentId, replyId, subReplyId } = req.params;
        const updatedSubReply = await communityService.deleteSubReply(subReplyId);
        if (!updatedSubReply) {
            return res.status(404).json({ message: '대대댓글을 찾을 수 없습니다.' });
        }
        res.status(200).json(updatedSubReply);
    } catch (error) {
        res.status(500).json({ message: '대대댓글 삭제에 실패했습니다.', error });
    }
};



export const getComments = async (req, res) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page || '1', 10);
        const size = parseInt(req.query.size || '20', 10);

        const { comments, totalCount } = await communityService.getCommentsByPost(id, page, size);
        
        res.status(200).json({ 
            comments, 
            totalPages: Math.ceil(totalCount / size),
            currentPage: page 
        });
    } catch (error) {
        res.status(500).json({ message: '댓글 조회에 실패했습니다.', error });
    }
};

export const getReplies = async (req, res) => {
    try {
        const { commentId } = req.params;
        const replies = await communityService.getRepliesByComment(commentId);
        res.status(200).json(replies);
    } catch (error) {
        res.status(500).json({ message: '대댓글 조회에 실패했습니다.', error });
    }
};

export const getSubReplies = async (req, res) => {
    try {
        const { replyId } = req.params;
        const subReplies = await communityService.getSubRepliesByReply(replyId);
        res.status(200).json(subReplies);
    } catch (error) {
        res.status(500).json({ message: '대대댓글 조회에 실패했습니다.', error });
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

// 투표 생성
export const createPoll = async (req, res) => {
    try {
        const { id } = req.params; // communityId
        const pollData = {
            ...req.body,
            createdBy: req.body.userId // 실제로는 인증 미들웨어에서 가져와야 함
        };

        const createdPoll = await communityService.createPoll(id, pollData);
        res.status(201).json(createdPoll);
    } catch (error) {
        // 투표 제한 에러는 400으로 처리
        if (error.message.includes('하나만 생성할 수 있습니다')) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: error.message });
    }
};

// 투표하기
export const votePoll = async (req, res) => {
    try {
        const { id, pollId } = req.params;
        const { userId, optionIndex } = req.body;

        if (!userId) {
            return res.status(400).json({ message: '사용자 정보가 필요합니다.' });
        }

        if (optionIndex === undefined || optionIndex < 0) {
            return res.status(400).json({ message: '유효한 선택지를 선택해주세요.' });
        }

        const updatedPoll = await communityService.votePoll(id, pollId, userId, optionIndex);
        res.status(200).json(updatedPoll);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// 투표 삭제
export const deletePoll = async (req, res) => {
    try {
        const { id, pollId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ message: '사용자 정보가 필요합니다.' });
        }

        // isAdmin 정보는 실제 인증 미들웨어에서 가져와야 함
        // 현재는 임시로 User 모델을 조회하여 userLv를 확인
        const user = await User.findById(userId);
        const isAdmin = user?.userLv >= 2;

        const result = await communityService.deletePoll(id, pollId, userId, isAdmin);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const cancelVote = async (req, res) => {
    try {
        const { id, pollId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ message: '사용자 정보가 필요합니다.' });
        }

        const result = await communityService.cancelVoteFromPoll(id, pollId, userId);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// 댓글 투표 생성
export const createCommentPoll = async (req, res) => {
    try {
        const { commentId } = req.params;
        const pollData = {
            ...req.body,
            createdBy: req.body.userId
        };

        const createdPoll = await communityService.createCommentPoll(commentId, pollData);
        res.status(201).json(createdPoll);
    } catch (error) {
        // 투표 제한 에러는 400으로 처리
        if (error.message.includes('하나만 생성할 수 있습니다')) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: error.message });
    }
};

// 댓글 투표 참여
export const voteCommentPoll = async (req, res) => {
    try {
        const { commentId, pollId } = req.params;
        const { userId, optionIndex } = req.body;

        if (!userId) {
            return res.status(400).json({ message: '사용자 정보가 필요합니다.' });
        }

        if (optionIndex === undefined || optionIndex < 0) {
            return res.status(400).json({ message: '유효한 선택지를 선택해주세요.' });
        }

        const updatedPoll = await communityService.voteCommentPoll(commentId, pollId, userId, optionIndex);
        res.status(200).json(updatedPoll);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// 댓글 투표 결과 조회
export const getCommentPollResults = async (req, res) => {
    try {
        const { commentId, pollId } = req.params;
        const results = await communityService.getCommentPollResults(commentId, pollId);
        res.status(200).json(results);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// 댓글 투표 상태 확인
export const getCommentUserVoteStatus = async (req, res) => {
    try {
        const { commentId, pollId } = req.params;
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ message: '사용자 정보가 필요합니다.' });
        }

        const status = await communityService.getCommentUserVoteStatus(commentId, pollId, userId);
        res.status(200).json(status || { hasVoted: false, votedOption: null });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// 댓글 투표 취소
export const cancelCommentVote = async (req, res) => {
    try {
        const { commentId, pollId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ message: '사용자 정보가 필요합니다.' });
        }

        const result = await communityService.cancelCommentVoteFromPoll(commentId, pollId, userId);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// 댓글 투표 삭제
export const deleteCommentPoll = async (req, res) => {
    try {
        const { commentId, pollId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ message: '사용자 정보가 필요합니다.' });
        }

        const result = await communityService.deleteCommentPoll(commentId, pollId, userId);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};
