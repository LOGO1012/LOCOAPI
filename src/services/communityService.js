import {Community} from '../models/Community.js';
import {Comment} from '../models/Comment.js';
import {Reply} from '../models/Reply.js';
import {SubReply} from '../models/SubReply.js';
import { CommunityHistory } from '../models/CommunityHistory.js';
import { CommentHistory } from '../models/CommentHistory.js';
import { ReplyHistory } from '../models/ReplyHistory.js';
import { SubReplyHistory } from '../models/SubReplyHistory.js';
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
        const filter = { commentedUserIds: userId, isDeleted: false };
        const totalCount = await Community.countDocuments(filter);

        const communities = await Community.find(filter)
            .select('_id communityTitle communityCategory userId commentCount communityViews recommended createdAt isAnonymous')
            .populate('userId', 'nickname')
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
                // 닉네임으로 사용자 검색 후 그 ID들로 필터링
                const users = await User.find({ nickname: { $regex: regex } }).select('_id');
                const userIds = users.map(u => u._id);
                filter.userId = { $in: userIds };
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
        .select('_id communityTitle communityCategory userId commentCount communityViews recommended createdAt isAnonymous communityImages') // Removed commentCount
        .populate('userId', 'nickname')
        .sort(sortCriteria)
        .skip(skip)
        .limit(size)
        .lean();

    return new PageResponseDTO(communities, pageRequestDTO, totalCount);
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

    const community = new Community(data);
    const savedCommunity = await community.save();

    // 생성 후 필요한 최소한의 필드만 반환
    return {
        _id: savedCommunity._id,
        communityTitle: savedCommunity.communityTitle,
        communityCategory: savedCommunity.communityCategory,
        isAnonymous: savedCommunity.isAnonymous,
        createdAt: savedCommunity.createdAt,
    };
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

    // 기존 데이터 조회 (히스토리 저장용)
    const currentPost = await Community.findById(id);
    if (currentPost && (data.communityTitle || data.communityContents)) {
        await CommunityHistory.create({
            postId: currentPost._id,
            title: currentPost.communityTitle,
            contents: currentPost.communityContents
        });
    }

    return await Community.findByIdAndUpdate(id, data, {new: true})
        .select('_id communityTitle communityCategory userId isAnonymous updatedAt')
        .populate('userId', 'nickname');
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
    ).select('_id isDeleted deletedAt');
};

// 조회수 증가 (커뮤니티 조회 시)
// ✅ 조회수 증가 (삭제되지 않은 게시글만)
export const incrementViews = async (id) => {
    return await Community.findOneAndUpdate(
        {_id: id, isDeleted: false},
        {$inc: {communityViews: 1}},
        {new: true}
    )
    .select('_id userId isAnonymous communityTitle communityContents communityCategory communityImages recommended recommendedUsers communityViews commentCount createdAt polls')
    .populate('userId', 'nickname');
};

export const getCommunityForEdit = async (id) => {
    return await Community.findOne({ _id: id, isDeleted: false })
        .select('_id communityTitle communityContents communityCategory isAnonymous communityImages')
        .lean();
};

// 추천 기능: 사용자별로 한 번만 추천할 수 있도록 처리
// ✅ 추천 기능 (삭제되지 않은 게시글만)
export const recommendCommunity = async (id, userId) => {
    const community = await Community.findOne({_id: id, isDeleted: false})
        .select('_id isDeleted recommendedUsers recommended');
    if (!community) {
        throw new Error("커뮤니티를 찾을 수 없습니다.");
    }

    if (community.recommendedUsers.includes(userId)) {
        throw new Error("이미 추천하셨습니다.");
    }

    community.recommendedUsers.push(userId);
    community.recommended = community.recommendedUsers.length;
    const savedCommunity = await community.save();

    return {
        _id: savedCommunity._id,
        recommended: savedCommunity.recommended,
        recommendedUsers: savedCommunity.recommendedUsers,
        updatedAt: savedCommunity.updatedAt,
    };
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
    ).select('_id recommended recommendedUsers updatedAt');
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

    const comment = new Comment({
        ...commentData,
        postId: communityId,
    });

    await comment.save();
    await Community.findByIdAndUpdate(communityId, { 
        $inc: { commentCount: 1 },
        $addToSet: { commentedUserIds: commentData.userId } // Add userId to commentedUserIds
    });
    return comment;
};

// addReply 함수도 동일하게 수정
export const addReply = async (commentId, replyData) => {
    // 욕설 필터링
    if (replyData.commentContents) {
        replyData.commentContents = filterProfanity(replyData.commentContents);
    }

    const reply = new Reply({
        ...replyData,
        commentId: commentId,
    });

    await reply.save();
    const comment = await Comment.findById(commentId).select('_id postId');
    if (comment) {
        await Community.findByIdAndUpdate(comment.postId, {
            $inc: { commentCount: 1 },
            $addToSet: { commentedUserIds: replyData.userId } // Add userId to commentedUserIds
        });
    }
    return reply;
};

// addSubReply 함수도 동일하게 수정
export const addSubReply = async (replyId, subReplyData) => {
    // 욕설 필터링
    if (subReplyData.commentContents) {
        subReplyData.commentContents = filterProfanity(subReplyData.commentContents);
    }

    const subReply = new SubReply({
        ...subReplyData,
        replyId: replyId,
    });

    await subReply.save();
    const reply = await Reply.findById(replyId).select('_id commentId'); // commentId만 조회
    const comment = await Comment.findById(reply.commentId).select('_id postId'); // postId만 조회
    if (comment) {
        await Community.findByIdAndUpdate(comment.postId, {
            $inc: { commentCount: 1 },
            $addToSet: { commentedUserIds: subReplyData.userId } // Add userId to commentedUserIds
        });
    }
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
        const community = await Community.findById(comment.postId).select('_id commentCount');
        if (community) {
            community.commentCount = Math.max(0, community.commentCount - 1);

            // Check if the user has any other comments, replies, or sub-replies on this post
            const userId = comment.userId;
            const postId = comment.postId;

            const hasOtherComments = await Comment.exists({ postId: postId, userId: userId, isDeleted: false, _id: { $ne: commentId } });
            const hasOtherReplies = await Reply.exists({ commentId: { $in: await Comment.find({ postId: postId }).distinct('_id') }, userId: userId, isDeleted: false });
            const hasOtherSubReplies = await SubReply.exists({ replyId: { $in: await Reply.find({ commentId: { $in: await Comment.find({ postId: postId }).distinct('_id') } }).distinct('_id') }, userId: userId, isDeleted: false });

            if (!hasOtherComments && !hasOtherReplies && !hasOtherSubReplies) {
                await Community.findByIdAndUpdate(postId, { $pull: { commentedUserIds: userId } });
            }
            await community.save();
        }

        // 업데이트된 댓글 정보 반환
        return { _id: commentId, isDeleted: true, deletedAt: new Date() };
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
        const comment = await Comment.findById(reply.commentId).select('_id postId');
        if (!comment) {
            throw new Error("댓글을 찾을 수 없습니다.");
        }

        // ✅ commentCount는 -1만 감소
        const community = await Community.findById(comment.postId);
        if (community) {
            community.commentCount = Math.max(0, community.commentCount - 1);

            // Check if the user has any other comments, replies, or sub-replies on this post
            const userId = reply.userId;
            const postId = comment.postId;

            const hasOtherComments = await Comment.exists({ postId: postId, userId: userId, isDeleted: false });
            const hasOtherReplies = await Reply.exists({ commentId: { $in: await Comment.find({ postId: postId }).distinct('_id') }, userId: userId, isDeleted: false, _id: { $ne: replyId } });
            const hasOtherSubReplies = await SubReply.exists({ replyId: { $in: await Reply.find({ commentId: { $in: await Comment.find({ postId: postId }).distinct('_id') } }).distinct('_id') }, userId: userId, isDeleted: false });

            if (!hasOtherComments && !hasOtherReplies && !hasOtherSubReplies) {
                await Community.findByIdAndUpdate(postId, { $pull: { commentedUserIds: userId } });
            }
            await community.save();
        }

        // 업데이트된 댓글 정보 반환
        return { _id: replyId, isDeleted: true, deletedAt: new Date() };
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
        const reply = await Reply.findById(subReply.replyId).select('_id commentId');
        if (!reply) {
            throw new Error("답글을 찾을 수 없습니다.");
        }

        const comment = await Comment.findById(reply.commentId).select('_id postId');
        if (!comment) {
            throw new Error("댓글을 찾을 수 없습니다.");
        }

        // ✅ commentCount는 -1만 감소
        const community = await Community.findById(comment.postId);
        if (community) {
            community.commentCount = Math.max(0, community.commentCount - 1);

            // Check if the user has any other comments, replies, or sub-replies on this post
            const userId = subReply.userId;
            const postId = comment.postId;

            const hasOtherComments = await Comment.exists({ postId: postId, userId: userId, isDeleted: false });
            const hasOtherReplies = await Reply.exists({ commentId: { $in: await Comment.find({ postId: postId }).distinct('_id') }, userId: userId, isDeleted: false });
            const hasOtherSubReplies = await SubReply.exists({ replyId: { $in: await Reply.find({ commentId: { $in: await Comment.find({ postId: postId }).distinct('_id') } }).distinct('_id') }, userId: userId, isDeleted: false, _id: { $ne: subReplyId } });

            if (!hasOtherComments && !hasOtherReplies && !hasOtherSubReplies) {
                await Community.findByIdAndUpdate(postId, { $pull: { commentedUserIds: userId } });
            }
            await community.save();
        }

        // 업데이트된 댓글 정보 반환
        return { _id: subReplyId, isDeleted: true, deletedAt: new Date() };
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
        // 24시간 간격 업데이트
        await redisClient.setEx('topViewedCommunities', 86400, JSON.stringify(topViewed));

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
        // 24시간 간격 업데이트
        await redisClient.setEx('topCommentedCommunities', 86400, JSON.stringify(topCommented));

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

        // 새로 생성된 투표만 반환 (votedUsers 제외)
        const createdPoll = savedCommunity.polls[savedCommunity.polls.length - 1].toObject();
        createdPoll.options.forEach(option => {
            delete option.votedUsers;
        });
        return createdPoll;
    } catch (error) {
        throw new Error(`투표 생성 실패: ${error.message}`);
    }
};

// 투표하기 (원자적 연산으로 리팩토링)
export const votePoll = async (communityId, pollId, userId, optionIndex) => {
    try {
        const community = await Community.findOne(
            { _id: communityId, "polls._id": pollId, isDeleted: false },
            { "polls.$": 1, "isDeleted": 1 }
        ).lean();

        if (!community || community.isDeleted) {
            throw new Error("게시글을 찾을 수 없습니다.");
        }

        const poll = community.polls[0];
        if (!poll) {
            throw new Error("투표를 찾을 수 없습니다.");
        }

        if (new Date() > poll.expiresAt) {
            throw new Error("투표가 마감되었습니다.");
        }

        // 사용자가 이미 투표한 옵션 찾기
        const userVotedOption = poll.options.find(opt => opt.votedUsers.some(voterId => voterId.equals(userId)));

        // 1. 만약 사용자가 이미 투표했다면, 기존 투표를 먼저 제거
        if (userVotedOption) {
            await Community.updateOne(
                { _id: communityId, "polls.options._id": userVotedOption._id },
                {
                    $pull: { "polls.$.options.$[opt].votedUsers": userId },
                    $inc: {
                        "polls.$.options.$[opt].votes": -1,
                        "polls.$.totalVotes": -1
                    }
                },
                { arrayFilters: [{ "opt._id": userVotedOption._id }] }
            );
        }

        const newOptionId = poll.options[optionIndex]._id;
        await Community.updateOne(
            { _id: communityId, "polls._id": pollId },
            {
                $push: { "polls.$.options.$[opt].votedUsers": userId },
                $inc: {
                    "polls.$.options.$[opt].votes": 1,
                    "polls.$.totalVotes": 1
                }
            },
            { arrayFilters: [{ "opt._id": newOptionId }] }
        );

        // 3. 최종 결과를 다시 조회하여 반환
        const finalCommunity = await Community.findById(communityId).lean();
        
        if (!finalCommunity) {
            console.error(`DEBUG: finalCommunity is null for communityId: ${communityId}`);
            throw new Error("투표 후 게시글을 찾을 수 없습니다.");
        }
        if (!finalCommunity.polls || finalCommunity.polls.length === 0) {
            console.error(`DEBUG: finalCommunity.polls is empty for communityId: ${communityId}`);
            throw new Error("투표 후 투표 목록을 찾을 수 없습니다.");
        }

        console.log(`DEBUG: Searching for pollId: ${pollId} in finalCommunity.polls:`, finalCommunity.polls.map(p => p._id));
        const finalPoll = finalCommunity.polls.find(p => p._id.equals(pollId));

        if (!finalPoll) {
            console.error(`DEBUG: finalPoll not found for pollId: ${pollId} in communityId: ${communityId}`);
            throw new Error("투표 후 해당 투표를 찾을 수 없습니다.");
        }

        // 4. 캐시 무효화
        await redisClient.del(`poll-results:${pollId}`);

        return {
            _id: finalPoll._id,
            question: finalPoll.question,
            options: finalPoll.options.map(option => ({
                text: option.text,
                votes: option.votes,
                votedUsers: option.votedUsers, // Include votedUsers
                percentage: finalPoll.totalVotes > 0 ? Math.round((option.votes / finalPoll.totalVotes) * 100) : 0
            })),
            totalVotes: finalPoll.totalVotes,
            expiresAt: finalPoll.expiresAt,
            isActive: finalPoll.isActive && new Date() <= finalPoll.expiresAt,
            createdAt: finalPoll.createdAt
        };

    } catch (error) {
        throw new Error(`투표 실패: ${error.message}`);
    }
};



// 투표 삭제 (투표 생성자나 게시글 작성자, 관리자만 가능)
export const deletePoll = async (communityId, pollId, userId, isAdmin) => {
    try {
        let updateConditions = {
            _id: communityId,
            isDeleted: false,
            "polls._id": pollId,
        };

        // 관리자가 아니면 권한 조건 추가
        if (!isAdmin) {
            updateConditions.$or = [
                { userId: userId }, // 게시글 작성자
                { "polls.createdBy": userId }, // 투표 생성자
            ];
        }

        const result = await Community.updateOne(
            updateConditions,
            { $pull: { polls: { _id: pollId } } }
        );

        if (result.matchedCount === 0) {
            throw new Error("투표를 찾을 수 없거나 삭제할 권한이 없습니다.");
        }
        if (result.modifiedCount === 0) {
            throw new Error("투표 삭제에 실패했습니다.");
        }

        return { message: "투표가 삭제되었습니다." };
    } catch (error) {
        throw new Error(`투표 삭제 실패: ${error.message}`);
    }
};


// communityService.js
export const getCommentsByPost = async (postId, page = 1, size = 20) => {
    const skip = (page - 1) * size;

    const totalCount = await Comment.countDocuments({
        postId: new mongoose.Types.ObjectId(postId),
    });

    // ✅ 삭제되지 않은 댓글만 조회, 페이지네이션 적용
    const comments = await Comment.find({
        postId: new mongoose.Types.ObjectId(postId),
    })
        .populate('userId', 'nickname')
        .sort({ createdAt: -1 }) // 최신순으로 정렬
        .skip(skip)
        .limit(size)
        .lean();

    for (const comment of comments) {
        const replyPage = 1;
        const replySize = 5;
        const replySkip = (replyPage - 1) * replySize;

        const totalReplies = await Reply.countDocuments({ commentId: comment._id });
        const replies = await Reply.find({ commentId: comment._id })
            .populate('userId', 'nickname')
            .sort({ createdAt: 1 })
            .skip(replySkip)
            .limit(replySize)
            .lean();

        for (const reply of replies) {
            const subReplyPage = 1;
            const subReplySize = 5;
            const subReplySkip = (subReplyPage - 1) * subReplySize;

            const totalSubReplies = await SubReply.countDocuments({ replyId: reply._id, isDeleted: false });
            const subReplies = await SubReply.find({ replyId: reply._id, isDeleted: false })
                .populate('userId', 'nickname')
                .sort({ createdAt: 1 })
                .skip(subReplySkip)
                .limit(subReplySize)
                .lean();

            reply.subReplies = subReplies;
            reply.totalSubReplies = totalSubReplies;
        }

        comment.replies = replies;
        comment.totalReplies = totalReplies;
    }

    return { comments, totalCount };
};


export const getRepliesByComment = async (commentId, page = 1, size = 5) => {
    const skip = (page - 1) * size;
    const totalCount = await Reply.countDocuments({ commentId });
    const replies = await Reply.find({ commentId })
        .populate('userId', 'nickname')
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(size)
        .lean();
    return { replies, totalCount };
};

export const getSubRepliesByReply = async (replyId, page = 1, size = 5) => {
    const skip = (page - 1) * size;
    const totalCount = await SubReply.countDocuments({ replyId, isDeleted: false });
    const subReplies = await SubReply.find({ replyId, isDeleted: false })
        .populate('userId', 'nickname')
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(size)
        .lean();
    return { subReplies, totalCount };
};

// 투표 취소 (원자적 연산으로 리팩토링)
export const cancelVoteFromPoll = async (communityId, pollId, userId) => {
    try {
        // 1. 사용자가 투표한 옵션을 찾기 위해 현재 투표 상태 조회
        const community = await Community.findOne(
            { _id: communityId, "polls._id": pollId, isDeleted: false },
            { "polls.$": 1, "isDeleted": 1 }
        ).lean();

        if (!community || community.isDeleted) {
            throw new Error("게시글을 찾을 수 없습니다.");
        }

        const poll = community.polls[0];
        if (!poll) {
            throw new Error("투표를 찾을 수 없습니다.");
        }

        const userVotedOption = poll.options.find(opt => opt.votedUsers.some(voterId => voterId.equals(userId)));

        if (!userVotedOption) {
            throw new Error("취소할 투표가 없습니다.");
        }

        // 2. 기존 투표 제거 (원자적 연산)
        await Community.updateOne(
            { _id: communityId, "polls.options._id": userVotedOption._id },
            {
                $pull: { "polls.$.options.$[opt].votedUsers": userId },
                $inc: {
                    "polls.$.options.$[opt].votes": -1,
                    "polls.$.totalVotes": -1
                }
            },
            { arrayFilters: [{ "opt._id": userVotedOption._id }] }
        );

        // 3. 업데이트된 결과를 다시 조회하여 반환
        const finalCommunity = await Community.findById(communityId).lean();
        const finalPoll = finalCommunity.polls.find(p => p._id.equals(pollId));

        return {
            _id: finalPoll._id,
            question: finalPoll.question,
            options: finalPoll.options.map(option => ({
                text: option.text,
                votes: option.votes,
                votedUsers: option.votedUsers, // Include votedUsers
                percentage: finalPoll.totalVotes > 0 ? Math.round((option.votes / finalPoll.totalVotes) * 100) : 0
            })),
            totalVotes: finalPoll.totalVotes,
            expiresAt: finalPoll.expiresAt,
            isActive: finalPoll.isActive && new Date() <= finalPoll.expiresAt,
            createdAt: finalPoll.createdAt
        };

    } catch (error) {
        throw new Error(`투표 취소 실패: ${error.message}`);
    }
};

// 댓글 투표 생성 (원자적 연산으로 리팩토링)
export const createCommentPoll = async (commentId, pollData) => {
    try {
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

        const updatedComment = await Comment.findOneAndUpdate(
            {
                _id: commentId,
                isDeleted: false,
                'polls.0': { $exists: false } // polls 배열이 비어있는지 확인
            },
            { $push: { polls: newPoll } },
            { new: true, select: 'polls' }
        );

        if (!updatedComment) {
            const comment = await Comment.findById(commentId).select('isDeleted polls');
            if (!comment || comment.isDeleted) {
                throw new Error("댓글을 찾을 수 없습니다.");
            }
            if (comment.polls && comment.polls.length > 0) {
                throw new Error("댓글당 투표는 하나만 생성할 수 있습니다.");
            }
            throw new Error("알 수 없는 이유로 투표 생성에 실패했습니다.");
        }

        // 새로 생성된 투표만 DTO로 변환하여 반환
        const newPollSubDoc = updatedComment.polls[updatedComment.polls.length - 1];
        return {
            _id: newPollSubDoc._id,
            question: newPollSubDoc.question,
            options: newPollSubDoc.options.map(o => ({ text: o.text, votes: o.votes })), // votedUsers 제외
            totalVotes: newPollSubDoc.totalVotes,
            expiresAt: newPollSubDoc.expiresAt,
            isActive: newPollSubDoc.isActive,
            createdBy: newPollSubDoc.createdBy,
            createdAt: newPollSubDoc.createdAt
        };
    } catch (error) {
        throw new Error(`댓글 투표 생성 실패: ${error.message}`);
    }
};

// 댓글 투표 참여 (원자적 연산으로 리팩토링)
export const voteCommentPoll = async (commentId, pollId, userId, optionIndex) => {
    try {
        const comment = await Comment.findOne(
            { _id: commentId, "polls._id": pollId, isDeleted: false },
            { "polls.$": 1, isDeleted: 1 }
        ).lean();

        if (!comment || comment.isDeleted) throw new Error("댓글을 찾을 수 없습니다.");

        const poll = comment.polls[0];
        if (!poll) throw new Error("투표를 찾을 수 없습니다.");
        if (new Date() > poll.expiresAt) throw new Error("투표가 마감되었습니다.");

        const userVotedOption = poll.options.find(opt => opt.votedUsers.some(voterId => voterId.equals(userId)));

        // 1. 사용자가 이미 투표했다면, 기존 투표를 먼저 제거 (원자적 연산)
        if (userVotedOption) {
            await Comment.updateOne(
                { _id: commentId, "polls.options._id": userVotedOption._id },
                {
                    $pull: { "polls.$.options.$[opt].votedUsers": userId },
                    $inc: {
                        "polls.$.options.$[opt].votes": -1,
                        "polls.$.totalVotes": -1
                    }
                },
                { arrayFilters: [{ "opt._id": userVotedOption._id }] }
            );
        }

        // 2. 새로운 선택지에 투표 추가 (원자적 연산)
        const newOptionId = poll.options[optionIndex]._id;
        await Comment.updateOne(
            { _id: commentId, "polls._id": pollId },
            {
                $push: { "polls.$.options.$[opt].votedUsers": userId },
                $inc: {
                    "polls.$.options.$[opt].votes": 1,
                    "polls.$.totalVotes": 1
                }
            },
            { arrayFilters: [{ "opt._id": newOptionId }] }
        );

        // 3. 최종 결과를 다시 조회하여 반환
        const finalCommunity = await Comment.findById(commentId).lean();
        
        if (!finalCommunity) {
            console.error(`DEBUG: finalCommunity is null for communityId: ${commentId}`);
            throw new Error("투표 후 게시글을 찾을 수 없습니다.");
        }
        if (!finalCommunity.polls || finalCommunity.polls.length === 0) {
            console.error(`DEBUG: finalCommunity.polls is empty for communityId: ${commentId}`);
            throw new Error("투표 후 투표 목록을 찾을 수 없습니다.");
        }

        console.log(`DEBUG: Searching for pollId: ${pollId} in finalCommunity.polls:`, finalCommunity.polls.map(p => p._id));
        const finalPoll = finalCommunity.polls.find(p => p._id.equals(pollId));

        if (!finalPoll) {
            console.error(`DEBUG: finalPoll not found for pollId: ${pollId} in communityId: ${commentId}`);
            throw new Error("투표 후 해당 투표를 찾을 수 없습니다.");
        }

        // 4. 캐시 무효화
        await redisClient.del(`poll-results:${pollId}`);

        return {
            _id: finalPoll._id,
            question: finalPoll.question,
            options: finalPoll.options.map(option => ({
                text: option.text,
                votes: option.votes,
                votedUsers: option.votedUsers, // Include votedUsers
                percentage: finalPoll.totalVotes > 0 ? Math.round((option.votes / finalPoll.totalVotes) * 100) : 0
            })),
            totalVotes: finalPoll.totalVotes
        };

    } catch (error) {
        throw new Error(`댓글 투표 실패: ${error.message}`);
    }
};

// 댓글 투표 결과 조회 (프로젝션 + 캐싱 최적화)
export const getCommentPollResults = async (commentId, pollId) => {
    try {
        const cacheKey = `poll-results:${pollId}`;
        const cachedResults = await redisClient.get(cacheKey);

        if (cachedResults) {
            return JSON.parse(cachedResults);
        }

        const comment = await Comment.findOne(
            { _id: commentId, "polls._id": pollId },
            { "polls.$": 1 }
        ).lean();

        if (!comment || !comment.polls || comment.polls.length === 0) {
            throw new Error("투표를 찾을 수 없습니다.");
        }

        const poll = comment.polls[0];

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

        // 15초 동안 결과를 캐시
        await redisClient.setEx(cacheKey, 15, JSON.stringify(results));

        return results;
    } catch (error) {
        throw new Error(`댓글 투표 결과 조회 실패: ${error.message}`);
    }
};

// 댓글 투표 상태 확인 (집계 파이프라인 최적화)
export const getCommentUserVoteStatus = async (commentId, pollId, userId) => {
    try {
        const result = await Comment.aggregate([
            // 1. 특정 댓글과 투표를 찾음
            { $match: { 
                _id: new mongoose.Types.ObjectId(commentId),
                "polls._id": new mongoose.Types.ObjectId(pollId)
            } },
            // 2. polls 배열에서 해당 투표만 남김
            { $project: {
                poll: {
                    $filter: {
                        input: "$polls",
                        as: "poll",
                        cond: { $eq: ["$$poll._id", new mongoose.Types.ObjectId(pollId)] }
                    }
                }
            } },
            // 3. 배열을 객체로 변환
            { $unwind: "$poll" },
            // 4. 사용자가 투표한 옵션의 인덱스를 찾음
            { $project: {
                _id: 0,
                votedOption: {
                    $indexOfArray: ["$poll.options.votedUsers", new mongoose.Types.ObjectId(userId)]
                }
            } },
            // 5. 최종 결과 포맷팅
            { $project: {
                hasVoted: { $gte: ["$votedOption", 0] },
                votedOption: { $cond: { if: { $gte: ["$votedOption", 0] }, then: "$votedOption", else: null } }
            } }
        ]);

        return result[0] || { hasVoted: false, votedOption: null };
    } catch (error) {
        console.error("Error getting user vote status:", error);
        return { hasVoted: false, votedOption: null };
    }
};

// 댓글 투표 취소 (원자적 연산으로 리팩토링)
export const cancelCommentVoteFromPoll = async (commentId, pollId, userId) => {
    try {
        // 1. 사용자가 투표한 옵션을 찾기 위해 현재 투표 상태 조회
        const comment = await Comment.findOne(
            { _id: commentId, "polls._id": pollId, isDeleted: false },
            { "polls.$": 1, isDeleted: 1 }
        ).lean();

        if (!comment || comment.isDeleted) throw new Error("댓글을 찾을 수 없습니다.");

        const poll = comment.polls[0];
        if (!poll) throw new Error("투표를 찾을 수 없습니다.");

        const userVotedOption = poll.options.find(opt => opt.votedUsers.some(voterId => voterId.equals(userId)));

        if (!userVotedOption) {
            throw new Error("취소할 투표가 없습니다.");
        }

        // 2. 기존 투표 제거 (원자적 연산)
        await Comment.updateOne(
            { _id: commentId, "polls.options._id": userVotedOption._id },
            {
                $pull: { "polls.$.options.$[opt].votedUsers": userId },
                $inc: {
                    "polls.$.options.$[opt].votes": -1,
                    "polls.$.totalVotes": -1
                }
            },
            { arrayFilters: [{ "opt._id": userVotedOption._id }] }
        );

        // 3. 업데이트된 결과를 다시 조회하여 DTO로 반환
        const finalComment = await Comment.findById(commentId).select('polls').lean();
        const finalPoll = finalComment.polls.find(p => p._id.equals(pollId));

        // 4. 캐시 무효화
        await redisClient.del(`poll-results:${pollId}`);

        return {
            _id: finalPoll._id,
            question: finalPoll.question,
            options: finalPoll.options.map(option => ({
                text: option.text,
                votes: option.votes,
                votedUsers: option.votedUsers, // Include votedUsers
                percentage: finalPoll.totalVotes > 0 ? Math.round((option.votes / finalPoll.totalVotes) * 100) : 0
            })),
            totalVotes: finalPoll.totalVotes
        };

    } catch (error) {
        throw new Error(`댓글 투표 취소 실패: ${error.message}`);
    }
};

// 댓글 투표 삭제 (원자적 연산으로 리팩토링)
export const deleteCommentPoll = async (commentId, pollId, userId, isAdmin) => {
    try {
        const updateQuery = {
            _id: commentId,
            "polls._id": pollId
        };

        // 관리자가 아닐 경우, 작성자 또는 투표 생성자만 삭제 가능하도록 조건 추가
        if (!isAdmin) {
            updateQuery.$or = [
                { userId: userId }, // 댓글 작성자
                { "polls.createdBy": userId } // 투표 생성자
            ];
        }

        const result = await Comment.updateOne(
            updateQuery,
            { $pull: { polls: { _id: pollId } } }
        );

        if (result.matchedCount === 0) {
            throw new Error("투표를 찾을 수 없거나 삭제할 권한이 없습니다.");
        }

        if (result.modifiedCount === 0) {
            // matchedCount는 1인데 modifiedCount가 0인 경우, 이미 삭제되었을 수 있음
            throw new Error("투표가 이미 삭제되었거나 삭제에 실패했습니다.");
        }

        // 캐시 무효화
        await redisClient.del(`poll-results:${pollId}`);

        return { message: "댓글 투표가 삭제되었습니다." };

    } catch (error) {
        throw new Error(`댓글 투표 삭제 실패: ${error.message}`);
    }
};

// ✅ 댓글 수정
export const updateComment = async (commentId, data) => {
    if (data.commentContents) {
        data.commentContents = filterProfanity(data.commentContents);
    }

    const currentComment = await Comment.findById(commentId);
    if (currentComment && data.commentContents) {
        await CommentHistory.create({
            commentId: currentComment._id,
            contents: currentComment.commentContents
        });
    }

    return await Comment.findByIdAndUpdate(
        commentId,
        { 
            commentContents: data.commentContents,
            updatedAt: new Date()
        },
        { new: true }
    ).populate('userId', 'nickname');
};

// ✅ 답글 수정
export const updateReply = async (replyId, data) => {
    if (data.commentContents) {
        data.commentContents = filterProfanity(data.commentContents);
    }

    const currentReply = await Reply.findById(replyId);
    if (currentReply && data.commentContents) {
        await ReplyHistory.create({
            replyId: currentReply._id,
            contents: currentReply.commentContents
        });
    }

    return await Reply.findByIdAndUpdate(
        replyId,
        { 
            commentContents: data.commentContents,
            updatedAt: new Date()
        },
        { new: true }
    ).populate('userId', 'nickname');
};

// ✅ 대댓글 수정
export const updateSubReply = async (subReplyId, data) => {
    if (data.commentContents) {
        data.commentContents = filterProfanity(data.commentContents);
    }

    const currentSubReply = await SubReply.findById(subReplyId);
    if (currentSubReply && data.commentContents) {
        await SubReplyHistory.create({
            subReplyId: currentSubReply._id,
            contents: currentSubReply.commentContents
        });
    }

    return await SubReply.findByIdAndUpdate(
        subReplyId,
        { 
            commentContents: data.commentContents,
            updatedAt: new Date()
        },
        { new: true }
    ).populate('userId', 'nickname');
};
