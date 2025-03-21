import { Community } from '../models/Community.js';

// 전체 커뮤니티 목록 조회
export const getAllCommunities = async () => {
    return await Community.find().sort({ createdAt: -1 });
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
    return await Community.findByIdAndUpdate(
        communityId,
        {
            $push: { comments: commentData },
            $inc: { commentCount: 1 }
        },
        { new: true }
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

