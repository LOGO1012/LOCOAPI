import { Community } from '../models/Community.js';
import PageResponseDTO from '../../src/dto/common/PageResponseDTO.js';
import cron from "node-cron";
import {User} from "../models/UserProfile.js"; // 파일 경로를 실제 경로에 맞게 수정하세요.

export const getCommunitiesPage = async (
    pageRequestDTO,
    category,
    userId,
    sort = '최신순',
    keyword = '',
    searchType = 'title+content'
) => {
    const { page, size } = pageRequestDTO;
    const skip = (page - 1) * size;
    let filter = {};

    // 카테고리 필터
    if (category === '내 글') {
        filter.userId = userId;
    } else if (category === '내 댓글') {
        filter.$or = [
            { 'comments.userId': userId },                    // 댓글
            { 'comments.replies.userId': userId },            // 대댓글
            { 'comments.replies.subReplies.userId': userId }  // 대대댓글
        ];
    } else if (category !== '전체') {
        filter.communityCategory = category;
    }

    // 키워드 검색
    if (keyword) {
        const regex = new RegExp(`${keyword}`, 'i');  // 접두사 검색 앵커
        switch (searchType) {
            case 'title':
                filter.communityTitle    = { $regex: regex };
                break;
            case 'content':
                filter.communityContents = { $regex: regex };
                break;
            case 'author':
                // userNickname 스냅샷 필드로 바로 검색
                filter.userNickname = { $regex: regex };
                break;
            case 'title+content':
                filter.$or = [
                    { communityTitle:   { $regex: regex } },
                    { communityContents:{ $regex: regex } }
                ];
                break;
        }
    }

    const totalCount = await Community.countDocuments(filter);

    const sortCriteria = sort === '인기순'
        ? { recommended: -1 }
        : { createdAt: -1 };

    const communities = await Community.find(filter)
        .sort(
            filter.$text
                ? { score: { $meta: "textScore" }, ...sortCriteria }
                : sortCriteria
        )
        .skip(skip)
        .limit(size)
        .lean();

    return new PageResponseDTO(communities, pageRequestDTO, totalCount);
};




// 단일 커뮤니티 조회 (ID 기준)
export const getCommunityById = async (id) => {
    return await Community.findById(id);
};

// 커뮤니티 생성
export const createCommunity = async (data) => {
    // 작성자 닉네임 스냅샷
    if (data.userId) {
        const author = await User.findById(data.userId, 'nickname');
        data.userNickname = author?.nickname || '';
    }
    const community = new Community(data);
    return await community.save();
};

// 커뮤니티 업데이트
export const updateCommunity = async (id, data) => {
    // userId가 변경되었거나 닉네임을 리프레시할 필요가 있을 때
    if (data.userId) {
        const author = await User.findById(data.userId, 'nickname');
        data.userNickname = author?.nickname || '';
    }
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

// 추천 취소 기능: 사용자 ID가 있을 때만 추천 목록에서 제거하고 추천 수 감소
export const cancelRecommendCommunity = async (id, userId) => {
    const updated = await Community.findOneAndUpdate(
        { _id: id, recommendedUsers: userId },
        {
            $pull: { recommendedUsers: userId },
            $inc: { recommended: -1 }
        },
        { new: true }
    );
    if (!updated) {
        throw new Error('추천한 내역이 없습니다.');
    }
    return updated;
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
        { $push: { "comments.$.replies": replyData }, $inc: { commentCount: 1 } },
        { new: true }
    );
};

// 대대댓글 추가: community.comments 배열 내에서 특정 comment와 그 reply를 찾아 subReplies에 추가
export const addSubReply = async (communityId, commentId, replyId, subReplyData) => {
    return await Community.findOneAndUpdate(
        { _id: communityId },
        {
            $push: { "comments.$[c].replies.$[r].subReplies": subReplyData }, $inc: { commentCount: 1 }
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
        { $pull: { "comments.$.replies": { _id: replyId } }, $inc: { commentCount: -1 } },
        { new: true }
    );
};

// 대대댓글 삭제: 특정 댓글의 대댓글 내부 subReplies 배열에서 해당 대대댓글 삭제 (arrayFilters 사용)
export const deleteSubReply = async (communityId, commentId, replyId, subReplyId) => {
    return await Community.findOneAndUpdate(
        { _id: communityId },
        { $pull: { "comments.$[c].replies.$[r].subReplies": { _id: subReplyId } }, $inc: { commentCount: -1 } },
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
        /* 조회수 TOP 5는 그대로 */
        cachedTopViewed = await Community.aggregate([
            { $sort: { communityViews: -1 } },
            { $limit: 10 },
            { $project: { communityTitle: 1, communityViews: 1 } }
        ]);

        /* 👇 댓글 수(부모‧대댓글‧대대댓글 총합) 를 계산해 TOP 5 산출 */
        cachedTopCommented = await Community.aggregate([
            {
                /* comments 배열(+ 하위 배열)의 전체 원소 수를 totalComments 로 산출 */
                $addFields: {
                    totalComments: {
                        $sum: [
                            { $size: '$comments' },
                            {
                                $sum: {
                                    $map: {
                                        input: '$comments',
                                        as: 'c',
                                        in: { $size: '$$c.replies' }
                                    }
                                }
                            },
                            {
                                $sum: {
                                    $map: {
                                        input: {
                                            $reduce: {
                                                input: '$comments',
                                                initialValue: [],
                                                in: { $concatArrays: ['$$value', '$$this.replies'] }
                                            }
                                        },
                                        as: 'r',
                                        in: { $size: '$$r.subReplies' }
                                    }
                                }
                            }
                        ]
                    }
                }
            },
            { $sort: { totalComments: -1 } }, // 총합 기준 내림차순
            { $limit: 10 },
            { $project: { communityTitle: 1, totalComments: 1 } }
        ]);

        console.log('Top caches updated successfully.');
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

// API에서 캐시된 데이터를 반환하도록 수정
export const getTopViewedCommunities = async () => {
    return cachedTopViewed;
};

export const getTopCommentedCommunities = async () => {
    return cachedTopCommented;
};



