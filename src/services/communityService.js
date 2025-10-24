import {Community} from '../models/Community.js';
import {Comment} from '../models/Comment.js';
import {Reply} from '../models/Reply.js';
import {SubReply} from '../models/SubReply.js';
import PageResponseDTO from '../../src/dto/common/PageResponseDTO.js';
import cron from "node-cron";
import {User} from "../models/UserProfile.js"; // 파일 경로를 실제 경로에 맞게 수정하세요.
import {containsProfanity, filterProfanity} from '../utils/profanityFilter.js';
import redisClient from '../config/redis.js';
import mongoose from 'mongoose';

export const getCommunitiesPage = async (
    pageRequestDTO,
    category,
    userId,
    sort = '최신순',
    keyword = '',
    searchType = 'title+content',
    period = '전체'
) => {
    const {page, size} = pageRequestDTO;
    const skip = (page - 1) * size;

    let sortCriteria;
    switch (sort) {
        case '인기순':
            sortCriteria = {communityViews: -1};
            break;
        case '추천순':
            sortCriteria = {recommended: -1};
            break;
        case '최신순':
        default:
            sortCriteria = {createdAt: -1};
            break;
    }

    if (category === '내 댓글') {
        // ✅ 1. Comment에서 사용자 댓글이 있는 게시글 ID 조회
        const userComments = await Comment.find({
            userId: userId
        }).distinct('postId');

        // ✅ 2. Reply에서 사용자 답글이 있는 commentId 조회
        const userReplyCommentIds = await Reply.find({
            userId: userId
        }).distinct('commentId');

        // commentId로 postId 조회
        const userReplyPostIds = await Comment.find({
            _id: { $in: userReplyCommentIds }
        }).distinct('postId');

        // ✅ 3. SubReply에서 사용자 대댓글이 있는 replyId 조회
        const userSubReplyReplyIds = await SubReply.find({
            userId: userId
        }).distinct('replyId');

        // replyId로 commentId 조회
        const userSubReplyCommentIds = await Reply.find({
            _id: { $in: userSubReplyReplyIds }
        }).distinct('commentId');

        // commentId로 postId 조회
        const userSubReplyPostIds = await Comment.find({
            _id: { $in: userSubReplyCommentIds }
        }).distinct('postId');

        // ✅ 4. 모든 postId 합치기 (중복 제거)
        const postIds = [...new Set([
            ...userComments,
            ...userReplyPostIds,
            ...userSubReplyPostIds
        ])];

        const filter = { _id: { $in: postIds }, isDeleted: false };
        const totalCount = await Community.countDocuments(filter);

        const communities = await Community.find(filter)
            .select('_id communityTitle communityCategory userNickname commentCount communityViews recommended createdAt isAnonymous anonymousNickname')
            .sort(sortCriteria)
            .skip(skip)
            .limit(size)
            .lean();

        return new PageResponseDTO(communities, pageRequestDTO, totalCount);
    }

    // Existing logic for other categories
    let filter = {isDeleted: false};

    if (period !== '전체') {
        const now = new Date();
        let startDate;

        switch (period) {
            case '지난 1일':
                startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case '지난 1주':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '지난 1달':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '지난 1년':
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = null;
        }

        if (startDate) {
            filter.createdAt = {$gte: startDate};
        }
    }

    if (category === '내 글') {
        filter.userId = userId;
    } else if (category !== '전체') {
        filter.communityCategory = category;
    }

    if (keyword) {
        const regex = new RegExp(`${keyword}`, 'i');
        switch (searchType) {
            case 'title':
                filter.communityTitle = {$regex: regex};
                break;
            case 'content':
                filter.communityContents = {$regex: regex};
                break;
            case 'author':
                filter.userNickname = {$regex: regex};
                break;
            case 'title+content':
                filter.$or = [
                    {communityTitle: {$regex: regex}},
                    {communityContents: {$regex: regex}}
                ];
                break;
        }
    }

    const totalCount = await Community.countDocuments(filter);
    const communities = await Community.find(filter)
        .select('_id communityTitle communityCategory userNickname commentCount communityViews recommended createdAt isAnonymous anonymousNickname') // Removed commentCount
        .sort(sortCriteria)
        .skip(skip)
        .limit(size)
        .lean();

    return new PageResponseDTO(communities, pageRequestDTO, totalCount);
};

// 익명 닉네임 생성 함수 추가
const generateAnonymousNickname = () => {
    const randomNum = Math.floor(Math.random() * 10000);
    return `익명${randomNum}`;
};

// 커뮤니티 생성
export const createCommunity = async (data) => {
    // 입력 유효성 검사
    if (!data.communityTitle || data.communityTitle.trim() === '') {
        throw new Error('제목은 필수 항목입니다.');
    }
    if (!data.communityContents || data.communityContents.trim() === '') {
        throw new Error('내용은 필수 항목입니다.');
    }

    // 욕설 포함 여부 확인
    if (containsProfanity(data.communityTitle) || containsProfanity(data.communityContents)) {
        throw new Error('제목이나 내용에 비속어가 포함되어 있어 게시글을 생성할 수 없습니다.');
    }

    if (data.userId) {
        // 기존 로직: 실명일 때만 실제 닉네임 조회
        const author = await User.findById(data.userId, 'nickname');
        data.userNickname = author?.nickname || '';
    }

    const community = new Community(data);
    return await community.save();
};

// 커뮤니티 업데이트
export const updateCommunity = async (id, data) => {
    // 입력 유효성 검사
    if (!data.communityTitle || data.communityTitle.trim() === '') {
        throw new Error('제목은 필수 항목입니다.');
    }
    if (!data.communityContents || data.communityContents.trim() === '') {
        throw new Error('내용은 필수 항목입니다.');
    }

    // 욕설 포함 여부 확인
    if (containsProfanity(data.communityTitle) || containsProfanity(data.communityContents)) {
        throw new Error('제목이나 내용에 비속어가 포함되어 있어 게시글을 수정할 수 없습니다.');
    }

    if (data.userId) {
        const author = await User.findById(data.userId, 'nickname');
        data.userNickname = author?.nickname || '';
    }

    return await Community.findByIdAndUpdate(id, data, {new: true});
};

// 커뮤니티 삭제
// ✅ 커뮤니티 soft delete
export const deleteCommunity = async (id) => {
    return await Community.findByIdAndUpdate(
        id,
        {
            isDeleted: true,
            deletedAt: new Date()
        },
        {new: true}
    );
};

// 조회수 증가 (커뮤니티 조회 시)
// ✅ 조회수 증가 (삭제되지 않은 게시글만)
export const incrementViews = async (id) => {
    return await Community.findOneAndUpdate(
        {_id: id, isDeleted: false},
        {$inc: {communityViews: 1}},
        {new: true}
    ); // Only populate main post author
};

// 추천 기능: 사용자별로 한 번만 추천할 수 있도록 처리
// ✅ 추천 기능 (삭제되지 않은 게시글만)
export const recommendCommunity = async (id, userId) => {
    const community = await Community.findOne({_id: id, isDeleted: false});
    if (!community) {
        throw new Error("커뮤니티를 찾을 수 없습니다.");
    }

    if (community.recommendedUsers.includes(userId)) {
        throw new Error("이미 추천하셨습니다.");
    }

    community.recommendedUsers.push(userId);
    community.recommended = community.recommendedUsers.length;
    return await community.save();
};

// 추천 취소 기능: 사용자 ID가 있을 때만 추천 목록에서 제거하고 추천 수 감소
export const cancelRecommendCommunity = async (id, userId) => {
    const updated = await Community.findOneAndUpdate(
        {_id: id, recommendedUsers: userId},
        {
            $pull: {recommendedUsers: userId},
            $inc: {recommended: -1}
        },
        {new: true}
    );
    if (!updated) {
        throw new Error('추천한 내역이 없습니다.');
    }
    return updated;
};

// addComment 함수 수정
export const addComment = async (communityId, commentData) => {
    // 욕설 필터링
    if (commentData.commentContents) {
        commentData.commentContents = filterProfanity(commentData.commentContents);
    }

    // ✅ 사용자 닉네임 조회 추가
    if (commentData.userId && !commentData.isAnonymous) {
        const user = await User.findById(commentData.userId);
        if (user) {
            commentData.userNickname = user.nickname || user.userId || '';
        }
    }

    const comment = new Comment({
        ...commentData,
        postId: communityId,
    });

    await comment.save();
    await Community.findByIdAndUpdate(communityId, { $inc: { commentCount: 1 } });
    return comment;
};

// addReply 함수도 동일하게 수정
export const addReply = async (commentId, replyData) => {
    // 욕설 필터링
    if (replyData.commentContents) {
        replyData.commentContents = filterProfanity(replyData.commentContents);
    }

    // ✅ 사용자 닉네임 조회 추가
    if (replyData.userId && !replyData.isAnonymous) {
        const user = await User.findById(replyData.userId);
        if (user) {
            replyData.userNickname = user.nickname || user.userId || '';
        }
    }

    const reply = new Reply({
        ...replyData,
        commentId: commentId,
    });

    await reply.save();
    const comment = await Comment.findById(commentId);
    await Community.findByIdAndUpdate(comment.postId, { $inc: { commentCount: 1 } });
    return reply;
};

// addSubReply 함수도 동일하게 수정
export const addSubReply = async (replyId, subReplyData) => {
    // 욕설 필터링
    if (subReplyData.commentContents) {
        subReplyData.commentContents = filterProfanity(subReplyData.commentContents);
    }

    // ✅ 사용자 닉네임 조회 추가
    if (subReplyData.userId && !subReplyData.isAnonymous) {
        const user = await User.findById(subReplyData.userId);
        if (user) {
            subReplyData.userNickname = user.nickname || user.userId || '';
        }
    }

    const subReply = new SubReply({
        ...subReplyData,
        replyId: replyId,
    });

    await subReply.save();
    const reply = await Reply.findById(replyId);
    const comment = await Comment.findById(reply.commentId);
    await Community.findByIdAndUpdate(comment.postId, { $inc: { commentCount: 1 } });
    return subReply;
};

// communityService.js

// ✅ 1. 댓글 삭제 - 댓글만 삭제 (답글/대댓글은 유지)
export const deleteComment = async (commentId) => {
    try {
        const comment = await Comment.findById(commentId);
        if (!comment) {
            throw new Error("댓글을 찾을 수 없습니다.");
        }

        // 댓글만 soft delete
        comment.isDeleted = true;
        comment.deletedAt = new Date();
        await comment.save();

        // ✅ commentCount는 -1만 감소
        const community = await Community.findById(comment.postId);
        if (community) {
            community.commentCount = Math.max(0, community.commentCount - 1);
            await community.save();
        }

        // 업데이트된 댓글 정보 반환
        const plainComment = comment.toObject();
        const replies = await Reply.find({ commentId: commentId }).lean();

        for (const r of replies) {
            const subReplies = await SubReply.find({ replyId: r._id }).lean();
            r.subReplies = Array.isArray(subReplies) ? subReplies : [];
        }

        plainComment.replies = Array.isArray(replies) ? replies : [];
        return plainComment;
    } catch (error) {
        console.error('댓글 삭제 오류:', error);
        throw error;
    }
};

// ✅ 2. 답글 삭제 - 답글만 삭제 (대댓글은 유지)
export const deleteReply = async (replyId) => {
    try {
        const reply = await Reply.findById(replyId);
        if (!reply) {
            throw new Error("답글을 찾을 수 없습니다.");
        }

        // 답글만 soft delete
        reply.isDeleted = true;
        reply.deletedAt = new Date();
        await reply.save();

        // 댓글 정보 조회
        const comment = await Comment.findById(reply.commentId);
        if (!comment) {
            throw new Error("댓글을 찾을 수 없습니다.");
        }

        // ✅ commentCount는 -1만 감소
        const community = await Community.findById(comment.postId);
        if (community) {
            community.commentCount = Math.max(0, community.commentCount - 1);
            await community.save();
        }

        // 업데이트된 댓글 정보 반환
        const plainComment = comment.toObject ? comment.toObject() : comment;
        const replies = await Reply.find({ commentId: comment._id }).lean();

        for (const r of replies) {
            const subReplies = await SubReply.find({ replyId: r._id }).lean();
            r.subReplies = Array.isArray(subReplies) ? subReplies : [];
        }

        plainComment.replies = Array.isArray(replies) ? replies : [];
        return plainComment;
    } catch (error) {
        console.error('답글 삭제 오류:', error);
        throw error;
    }
};

// ✅ 3. 대댓글 삭제 - 대댓글만 삭제
export const deleteSubReply = async (subReplyId) => {
    try {
        const subReply = await SubReply.findById(subReplyId);
        if (!subReply) {
            throw new Error("대댓글을 찾을 수 없습니다.");
        }

        // 대댓글만 soft delete
        subReply.isDeleted = true;
        subReply.deletedAt = new Date();
        await subReply.save();

        // 답글 정보 조회
        const reply = await Reply.findById(subReply.replyId);
        if (!reply) {
            throw new Error("답글을 찾을 수 없습니다.");
        }

        const comment = await Comment.findById(reply.commentId);
        if (!comment) {
            throw new Error("댓글을 찾을 수 없습니다.");
        }

        // ✅ commentCount는 -1만 감소
        const community = await Community.findById(comment.postId);
        if (community) {
            community.commentCount = Math.max(0, community.commentCount - 1);
            await community.save();
        }

        // 업데이트된 댓글 정보 반환
        const plainComment = comment.toObject ? comment.toObject() : comment;
        const replies = await Reply.find({ commentId: comment._id }).lean();

        for (const r of replies) {
            const subReplies = await SubReply.find({ replyId: r._id }).lean();
            r.subReplies = Array.isArray(subReplies) ? subReplies : [];
        }

        plainComment.replies = Array.isArray(replies) ? replies : [];
        return plainComment;
    } catch (error) {
        console.error('대댓글 삭제 오류:', error);
        throw error;
    }
};

// 아래는 24시간마다 집계 결과를 갱신하기 위한 캐시와 관련 함수입니다.

// 전역 캐시 변수는 이제 Redis로 대체됩니다.

// ✅ 캐시 업데이트 함수 - 카테고리 정보 추가, 최근 일주일 기준으로 변경
export const updateTopCaches = async () => {
    try {
        // ✅ 최근 일주일 날짜 계산
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        // ✅ 최근 일주일 최다 조회 (카테고리 정보 추가)
        const topViewed = await Community.aggregate([
            {
                $match: {
                    isDeleted: false,
                    createdAt: {$gte: oneWeekAgo}
                }
            },
            {$sort: {communityViews: -1}},
            {$limit: 10},
            {
                $project: {
                    communityTitle: 1,
                    communityViews: 1,
                    createdAt: 1,
                    communityCategory: 1, // ✅ 카테고리 정보 추가
                    _id: 1 // ✅ 게시글 ID도 추가 (링크 연결용)
                }
            }
        ]);

        // Store cachedTopViewed in Redis
        await redisClient.setEx('topViewedCommunities', 3600, JSON.stringify(topViewed));

        // ✅ 최근 일주일 최다 댓글 (카테고리 정보 추가)
        const topCommented = await Community.aggregate([
            {
                $match: {
                    isDeleted: false,
                    createdAt: {$gte: oneWeekAgo}
                }
            },
            {$sort: {commentCount: -1}},
            {$limit: 10},
            {
                $project: {
                    communityTitle: 1,
                    totalComments: '$commentCount',
                    createdAt: 1,
                    communityCategory: 1, // ✅ 카테고리 정보 추가
                    _id: 1 // ✅ 게시글 ID도 추가 (링크 연결용)
                }
            }
        ]);

        // Store cachedTopCommented in Redis
        await redisClient.setEx('topCommentedCommunities', 3600, JSON.stringify(topCommented));

        console.log('Top caches updated successfully (recent week basis with category info).');
    } catch (err) {
        console.error('Failed to update top caches:', err);
    }
};


// 서버 시작 시 한 번 캐시 업데이트
updateTopCaches();

// 매일 자정에 캐시를 업데이트 (24시간마다)
cron.schedule('0 0 * * *', async () => {
    await updateTopCaches();
});

// ✅ API에서 캐시된 데이터를 반환 (이제 최근 일주일 데이터)
export const getTopViewedCommunities = async () => {
    let cached = await redisClient.get('topViewedCommunities');
    if (cached) {
        return JSON.parse(cached);
    }

    // If cache is empty, refresh it and try again
    await updateTopCaches();
    cached = await redisClient.get('topViewedCommunities');
    if (cached) {
        return JSON.parse(cached);
    }
    return []; // Fallback if cache refresh also fails
};

export const getTopCommentedCommunities = async () => {
    let cached = await redisClient.get('topCommentedCommunities');
    if (cached) {
        return JSON.parse(cached);
    }

    // If cache is empty, refresh it and try again
    await updateTopCaches();
    cached = await redisClient.get('topCommentedCommunities');
    if (cached) {
        return JSON.parse(cached);
    }
    return []; // Fallback if cache refresh also fails
};

// 투표 생성
export const createPoll = async (communityId, pollData) => {
    try {
        const community = await Community.findOne({_id: communityId, isDeleted: false});
        if (!community) {
            throw new Error("게시글을 찾을 수 없습니다.");
        }

        // 이미 투표가 있는지 확인 (핵심 추가!)
        if (community.polls && community.polls.length > 0) {
            throw new Error("게시글당 투표는 하나만 생성할 수 있습니다.");
        }

        // 투표 만료 시간 설정 (시간 단위로 받음)
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + (pollData.duration || 24));

        const newPoll = {
            question: pollData.question,
            options: pollData.options.map(opt => ({
                text: opt.text,
                votes: 0,
                votedUsers: []
            })),
            createdBy: pollData.createdBy,
            expiresAt: expiresAt,
            totalVotes: 0,
            isActive: true
        };

        community.polls.push(newPoll);
        const savedCommunity = await community.save();

        // 새로 생성된 투표만 반환
        const createdPoll = savedCommunity.polls[savedCommunity.polls.length - 1];
        return createdPoll;
    } catch (error) {
        throw new Error(`투표 생성 실패: ${error.message}`);
    }
};

// 투표하기
export const votePoll = async (communityId, pollId, userId, optionIndex) => {
    try {
        const community = await Community.findOne({_id: communityId, isDeleted: false});
        if (!community) {
            throw new Error("게시글을 찾을 수 없습니다.");
        }

        const poll = community.polls.id(pollId);
        if (!poll) {
            throw new Error("투표를 찾을 수 없습니다.");
        }

        // 투표 만료 확인
        if (new Date() > poll.expiresAt) {
            throw new Error("투표가 마감되었습니다.");
        }

        // 이미 투표했는지 확인
        const hasVoted = poll.options.some(option =>
            option.votedUsers.includes(userId)
        );

        if (hasVoted) {
            // 기존 투표 취소
            poll.options.forEach(option => {
                const userIndex = option.votedUsers.indexOf(userId);
                if (userIndex > -1) {
                    option.votedUsers.splice(userIndex, 1);
                    option.votes = Math.max(0, option.votes - 1);
                    poll.totalVotes = Math.max(0, poll.totalVotes - 1);
                }
            });
        }

        // 새로운 투표 추가
        if (optionIndex >= 0 && optionIndex < poll.options.length) {
            poll.options[optionIndex].votedUsers.push(userId);
            poll.options[optionIndex].votes += 1;
            poll.totalVotes += 1;
        }

        await community.save();
        return poll;
    } catch (error) {
        throw new Error(`투표 실패: ${error.message}`);
    }
};

// 투표 결과 조회
export const getPollResults = async (communityId, pollId) => {
    try {
        const community = await Community.findOne({_id: communityId, isDeleted: false});
        if (!community) {
            throw new Error("게시글을 찾을 수 없습니다.");
        }

        const poll = community.polls.id(pollId);
        if (!poll) {
            throw new Error("투표를 찾을 수 없습니다.");
        }

        // 사용자 정보는 제외하고 결과만 반환
        const results = {
            _id: poll._id,
            question: poll.question,
            options: poll.options.map(option => ({
                text: option.text,
                votes: option.votes,
                percentage: poll.totalVotes > 0 ? Math.round((option.votes / poll.totalVotes) * 100) : 0
            })),
            totalVotes: poll.totalVotes,
            expiresAt: poll.expiresAt,
            isActive: poll.isActive && new Date() <= poll.expiresAt,
            createdAt: poll.createdAt
        };

        return results;
    } catch (error) {
        throw new Error(`투표 결과 조회 실패: ${error.message}`);
    }
};

// 사용자의 투표 상태 확인
export const getUserVoteStatus = async (communityId, pollId, userId) => {
    try {
        const community = await Community.findOne({_id: communityId, isDeleted: false});
        if (!community) return null;

        const poll = community.polls.id(pollId);
        if (!poll) return null;

        // 사용자가 투표한 옵션 찾기
        const votedOptionIndex = poll.options.findIndex(option =>
            option.votedUsers.includes(userId)
        );

        return {
            hasVoted: votedOptionIndex >= 0,
            votedOption: votedOptionIndex >= 0 ? votedOptionIndex : null
        };
    } catch (error) {
        return null;
    }
};

// 투표 삭제 (투표 생성자나 게시글 작성자, 관리자만 가능)
export const deletePoll = async (communityId, pollId, userId) => {
    try {
        const community = await Community.findOne({_id: communityId, isDeleted: false});
        if (!community) {
            throw new Error("게시글을 찾을 수 없습니다.");
        }

        const poll = community.polls.id(pollId);
        if (!poll) {
            throw new Error("투표를 찾을 수 없습니다.");
        }

        // 권한 확인
        const user = await User.findById(userId);
        const isAdmin = user?.userLv >= 2;
        const isPostAuthor = community.userId.toString() === userId;
        const isPollCreator = poll.createdBy.toString() === userId;

        if (!isAdmin && !isPostAuthor && !isPollCreator) {
            throw new Error("투표를 삭제할 권한이 없습니다.");
        }

        // 투표 삭제
        community.polls.pull(pollId);
        await community.save();

        return {message: "투표가 삭제되었습니다."};
    } catch (error) {
        throw new Error(`투표 삭제 실패: ${error.message}`);
    }
};


// communityService.js
export const getCommentsByPost = async (postId) => {
    // ✅ 삭제되지 않은 댓글만 조회
    const comments = await Comment.find({
        postId: new mongoose.Types.ObjectId(postId),
    }).lean();

    for (const comment of comments) {
        // ✅ 삭제되지 않은 답글만 조회
        const replies = await Reply.find({
            commentId: comment._id,
        }).lean();

        for (const reply of replies) {
            // ✅ 삭제되지 않은 대댓글만 조회
            const subReplies = await SubReply.find({
                replyId: reply._id,
            }).lean();

            // ✅ subReplies를 배열로 확실히 설정
            reply.subReplies = Array.isArray(subReplies) ? subReplies : [];
        }

        // ✅ replies를 배열로 확실히 설정
        comment.replies = Array.isArray(replies) ? replies : [];
    }

    return comments;
};


export const getRepliesByComment = async (commentId) => {
    return Reply.find({ commentId, isDeleted: false });
};

export const getSubRepliesByReply = async (replyId) => {
    return SubReply.find({ replyId, isDeleted: false });
};

export const cancelVoteFromPoll = async (communityId, pollId, userId) => {
    try {
        const community = await Community.findOne({_id: communityId, isDeleted: false});
        if (!community) {
            throw new Error("게시글을 찾을 수 없습니다.");
        }

        const poll = community.polls.id(pollId);
        if (!poll) {
            throw new Error("투표를 찾을 수 없습니다.");
        }

        // 사용자의 기존 투표 제거
        let voteRemoved = false;
        poll.options.forEach(option => {
            const userIndex = option.votedUsers.indexOf(userId);
            if (userIndex > -1) {
                option.votedUsers.splice(userIndex, 1);
                option.votes = Math.max(0, option.votes - 1);
                poll.totalVotes = Math.max(0, poll.totalVotes - 1);
                voteRemoved = true;
            }
        });

        if (!voteRemoved) {
            throw new Error("취소할 투표가 없습니다.");
        }

        await community.save();
        return poll;
    } catch (error) {
        throw new Error(`투표 취소 실패: ${error.message}`);
    }
};

// 댓글 투표 생성
export const createCommentPoll = async (commentId, pollData) => {
    try {
        const comment = await Comment.findById(commentId);
        if (!comment || comment.isDeleted) {
            throw new Error("댓글을 찾을 수 없습니다.");
        }

        // 댓글에 이미 투표가 있는지 확인 (핵심 추가!)
        if (comment.polls && comment.polls.length > 0) {
            throw new Error("댓글당 투표는 하나만 생성할 수 있습니다.");
        }

        // 투표 만료 시간 설정
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + (pollData.duration || 24));

        const newPoll = {
            question: pollData.question,
            options: pollData.options.map(opt => ({
                text: opt.text,
                votes: 0,
                votedUsers: []
            })),
            createdBy: pollData.createdBy,
            expiresAt: expiresAt,
            totalVotes: 0,
            isActive: true
        };

        comment.polls.push(newPoll);
        const savedComment = await comment.save();

        // 새로 생성된 투표만 반환
        const createdPoll = savedComment.polls[savedComment.polls.length - 1];
        return createdPoll;
    } catch (error) {
        throw new Error(`댓글 투표 생성 실패: ${error.message}`);
    }
};

// 댓글 투표 참여
export const voteCommentPoll = async (commentId, pollId, userId, optionIndex) => {
    try {
        const comment = await Comment.findById(commentId);
        if (!comment || comment.isDeleted) {
            throw new Error("댓글을 찾을 수 없습니다.");
        }

        const poll = comment.polls.id(pollId);
        if (!poll) {
            throw new Error("투표를 찾을 수 없습니다.");
        }

        // 투표 만료 확인
        if (new Date() > poll.expiresAt) {
            throw new Error("투표가 마감되었습니다.");
        }

        // 이미 투표했는지 확인
        const hasVoted = poll.options.some(option =>
            option.votedUsers.includes(userId)
        );

        if (hasVoted) {
            // 기존 투표 취소
            poll.options.forEach(option => {
                const userIndex = option.votedUsers.indexOf(userId);
                if (userIndex > -1) {
                    option.votedUsers.splice(userIndex, 1);
                    option.votes = Math.max(0, option.votes - 1);
                    poll.totalVotes = Math.max(0, poll.totalVotes - 1);
                }
            });
        }

        // 새로운 투표 추가
        if (optionIndex >= 0 && optionIndex < poll.options.length) {
            poll.options[optionIndex].votedUsers.push(userId);
            poll.options[optionIndex].votes += 1;
            poll.totalVotes += 1;
        }

        await comment.save();
        return poll;
    } catch (error) {
        throw new Error(`댓글 투표 실패: ${error.message}`);
    }
};

// 댓글 투표 결과 조회
export const getCommentPollResults = async (commentId, pollId) => {
    try {
        const comment = await Comment.findById(commentId);
        if (!comment) {
            throw new Error("댓글을 찾을 수 없습니다.");
        }

        const poll = comment.polls.id(pollId);
        if (!poll) {
            throw new Error("투표를 찾을 수 없습니다.");
        }

        // 사용자 정보는 제외하고 결과만 반환
        const results = {
            _id: poll._id,
            question: poll.question,
            options: poll.options.map(option => ({
                text: option.text,
                votes: option.votes,
                percentage: poll.totalVotes > 0 ? Math.round((option.votes / poll.totalVotes) * 100) : 0
            })),
            totalVotes: poll.totalVotes,
            expiresAt: poll.expiresAt,
            isActive: poll.isActive && new Date() <= poll.expiresAt,
            createdAt: poll.createdAt
        };

        return results;
    } catch (error) {
        throw new Error(`댓글 투표 결과 조회 실패: ${error.message}`);
    }
};

// 댓글 투표 상태 확인
export const getCommentUserVoteStatus = async (commentId, pollId, userId) => {
    try {
        const comment = await Comment.findById(commentId);
        if (!comment) return null;

        const poll = comment.polls.id(pollId);
        if (!poll) return null;

        // 사용자가 투표한 옵션 찾기
        const votedOptionIndex = poll.options.findIndex(option =>
            option.votedUsers.includes(userId)
        );

        return {
            hasVoted: votedOptionIndex >= 0,
            votedOption: votedOptionIndex >= 0 ? votedOptionIndex : null
        };
    } catch (error) {
        return null;
    }
};

// 댓글 투표 취소
export const cancelCommentVoteFromPoll = async (commentId, pollId, userId) => {
    try {
        const comment = await Comment.findById(commentId);
        if (!comment) {
            throw new Error("댓글을 찾을 수 없습니다.");
        }

        const poll = comment.polls.id(pollId);
        if (!poll) {
            throw new Error("투표를 찾을 수 없습니다.");
        }

        // 사용자의 기존 투표 제거
        let voteRemoved = false;
        poll.options.forEach(option => {
            const userIndex = option.votedUsers.indexOf(userId);
            if (userIndex > -1) {
                option.votedUsers.splice(userIndex, 1);
                option.votes = Math.max(0, option.votes - 1);
                poll.totalVotes = Math.max(0, poll.totalVotes - 1);
                voteRemoved = true;
            }
        });

        if (!voteRemoved) {
            throw new Error("취소할 투표가 없습니다.");
        }

        await comment.save();
        return poll;
    } catch (error) {
        throw new Error(`댓글 투표 취소 실패: ${error.message}`);
    }
};

// 댓글 투표 삭제
export const deleteCommentPoll = async (commentId, pollId, userId) => {
    try {
        const comment = await Comment.findById(commentId);
        if (!comment) {
            throw new Error("댓글을 찾을 수 없습니다.");
        }

        const poll = comment.polls.id(pollId);
        if (!poll) {
            throw new Error("투표를 찾을 수 없습니다.");
        }

        // 권한 확인
        const user = await User.findById(userId);
        const isAdmin = user?.userLv >= 2;
        const isCommentAuthor = comment.userId.toString() === userId;
        const isPollCreator = poll.createdBy.toString() === userId;

        if (!isAdmin && !isCommentAuthor && !isPollCreator) {
            throw new Error("투표를 삭제할 권한이 없습니다.");
        }

        // 투표 삭제
        comment.polls.pull(pollId);
        await comment.save();

        return {message: "댓글 투표가 삭제되었습니다."};
    } catch (error) {
        throw new Error(`댓글 투표 삭제 실패: ${error.message}`);
    }
};
