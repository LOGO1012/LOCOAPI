import { Community } from '../models/Community.js';
import PageResponseDTO from '../../src/dto/common/PageResponseDTO.js';
import cron from "node-cron"; // 파일 경로를 실제 경로에 맞게 수정하세요.

export const getCommunitiesPage = async (pageRequestDTO, category) => {
    const { page, size } = pageRequestDTO;
    const skip = (page - 1) * size;

    // category가 '전체'가 아니라면 필터 조건에 추가
    let filter = {};
    if (category && category !== '전체') {
        filter.communityCategory = category;
    }

    // 조건에 맞는 전체 커뮤니티 수 조회
    const totalCount = await Community.countDocuments(filter);

    // 조건을 만족하는 커뮤니티 목록 조회 (최신순 정렬)
    const communities = await Community.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(size);

    return new PageResponseDTO(communities, pageRequestDTO, totalCount);
};


// 단일 커뮤니티 조회 (ID 기준)
export const getCommunityById = async (id) => {
    return await Community.findById(id);
};

// 커뮤니티 생성
export const createCommunity = async (data) => {
    const community = new Community(data);
    return await community.save();
};

// 커뮤니티 업데이트
export const updateCommunity = async (id, data) => {
    return await Community.findByIdAndUpdate(id, data, { new: true });
};

// 커뮤니티 삭제
export const deleteCommunity = async (id) => {
    return await Community.findByIdAndDelete(id);
};

// 조회수 증가 (커뮤니티 조회 시)
export const incrementViews = async (id) => {
    return await Community.findByIdAndUpdate(
        id,
        { $inc: { communityViews: 1 } },
        { new: true }
    );
};

// 추천 기능: 사용자별로 한 번만 추천할 수 있도록 처리
export const recommendCommunity = async (id, userId) => {
    const community = await Community.findById(id);
    if (!community) {
        throw new Error("커뮤니티를 찾을 수 없습니다.");
    }
    // 이미 추천한 사용자인지 확인
    if (community.recommendedUsers.includes(userId)) {
        throw new Error("이미 추천하셨습니다.");
    }
    // 추천 사용자 목록에 추가하고, 추천 수 업데이트
    community.recommendedUsers.push(userId);
    community.recommended = community.recommendedUsers.length;
    return await community.save();
};

// 댓글 추가: 댓글 데이터를 community.comments 배열에 추가하고, commentCount 1 증가
export const addComment = async (communityId, commentData) => {
    return Community.findByIdAndUpdate(
        communityId,
        {
            $push: {comments: commentData},
            $inc: {commentCount: 1}
        },
        {new: true}
    );
};

// 대댓글 추가: 특정 댓글의 replies 배열에 새 대댓글을 추가하고, commentCount는 그대로 유지
export const addReply = async (communityId, commentId, replyData) => {
    return await Community.findOneAndUpdate(
        { _id: communityId, "comments._id": commentId },
        { $push: { "comments.$.replies": replyData } },
        { new: true }
    );
};

// 대대댓글 추가: community.comments 배열 내에서 특정 comment와 그 reply를 찾아 subReplies에 추가
export const addSubReply = async (communityId, commentId, replyId, subReplyData) => {
    return await Community.findOneAndUpdate(
        { _id: communityId },
        {
            $push: { "comments.$[c].replies.$[r].subReplies": subReplyData }
        },
        {
            new: true,
            arrayFilters: [
                { "c._id": commentId },
                { "r._id": replyId }
            ]
        }
    );
};

// 댓글 삭제: comments 배열에서 특정 댓글을 삭제하고 commentCount를 1 감소
export const deleteComment = async (communityId, commentId) => {
    return await Community.findByIdAndUpdate(
        communityId,
        {
            $pull: { comments: { _id: commentId } },
            $inc: { commentCount: -1 }
        },
        { new: true }
    );
};

// 대댓글 삭제: 특정 댓글 내의 replies 배열에서 해당 대댓글 삭제
export const deleteReply = async (communityId, commentId, replyId) => {
    return await Community.findOneAndUpdate(
        { _id: communityId, "comments._id": commentId },
        { $pull: { "comments.$.replies": { _id: replyId } } },
        { new: true }
    );
};

// 대대댓글 삭제: 특정 댓글의 대댓글 내부 subReplies 배열에서 해당 대대댓글 삭제 (arrayFilters 사용)
export const deleteSubReply = async (communityId, commentId, replyId, subReplyId) => {
    return await Community.findOneAndUpdate(
        { _id: communityId },
        { $pull: { "comments.$[c].replies.$[r].subReplies": { _id: subReplyId } } },
        {
            new: true,
            arrayFilters: [
                { "c._id": commentId },
                { "r._id": replyId }
            ]
        }
    );
};

// 아래는 24시간마다 집계 결과를 갱신하기 위한 캐시와 관련 함수입니다.

// 전역 캐시 변수
let cachedTopViewed = [];
let cachedTopCommented = [];

// 캐시를 업데이트하는 함수
export const updateTopCaches = async () => {
    try {
        cachedTopViewed = await Community.aggregate([
            { $sort: { communityViews: -1 } },
            { $limit: 5 }
        ]);
        cachedTopCommented = await Community.aggregate([
            { $sort: { commentCount: -1 } },
            { $limit: 5 }
        ]);
        console.log('Top caches updated successfully.');
    } catch (error) {
        console.error('Failed to update top caches:', error);
    }
};

// 서버 시작 시 한 번 캐시 업데이트
updateTopCaches();

// 매일 자정에 캐시를 업데이트 (24시간마다)
cron.schedule('0 0 * * *', async () => {
    await updateTopCaches();
});

// API에서 캐시된 데이터를 반환하도록 수정
export const getTopViewedCommunities = async () => {
    return cachedTopViewed;
};

export const getTopCommentedCommunities = async () => {
    return cachedTopCommented;
};



