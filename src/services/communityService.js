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

    // ✅ 기본 필터에 soft delete 조건 추가
    let filter = { isDeleted: false };

    // 나머지 필터 로직은 동일...
    if (category === '내 글') {
        filter.userId = userId;
    } else if (category === '내 댓글') {
        filter.$or = [
            { 'comments.userId': userId, 'comments.isDeleted': false },
            { 'comments.replies.userId': userId, 'comments.replies.isDeleted': false },
            { 'comments.replies.subReplies.userId': userId, 'comments.replies.subReplies.isDeleted': false }
        ];
    } else if (category !== '전체') {
        filter.communityCategory = category;
    }

    // 키워드 검색 로직...
    if (keyword) {
        const regex = new RegExp(`${keyword}`, 'i');
        switch (searchType) {
            case 'title':
                filter.communityTitle = { $regex: regex };
                break;
            case 'content':
                filter.communityContents = { $regex: regex };
                break;
            case 'author':
                filter.userNickname = { $regex: regex };
                break;
            case 'title+content':
                filter.$or = [
                    { communityTitle: { $regex: regex } },
                    { communityContents: { $regex: regex } }
                ];
                break;
        }
    }

    const totalCount = await Community.countDocuments(filter);
    const sortCriteria = sort === '인기순' ? { recommended: -1 } : { createdAt: -1 };

    const communities = await Community.find(filter)
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
    // ✅ 익명 처리 로직 추가
    if (data.isAnonymous) {
        data.userNickname = '익명';
        // 또는 랜덤 익명 닉네임 사용
        // data.anonymousNickname = generateAnonymousNickname();
    } else if (data.userId) {
        // 기존 로직: 실명일 때만 실제 닉네임 조회
        const author = await User.findById(data.userId, 'nickname');
        data.userNickname = author?.nickname || '';
    }

    const community = new Community(data);
    return await community.save();
};

// 커뮤니티 업데이트
export const updateCommunity = async (id, data) => {
    // ✅ 익명 처리 로직 추가
    if (data.isAnonymous) {
        data.userNickname = '익명';
    } else if (data.userId) {
        const author = await User.findById(data.userId, 'nickname');
        data.userNickname = author?.nickname || '';
    }

    return await Community.findByIdAndUpdate(id, data, { new: true });
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
        { new: true }
    );
};

// 조회수 증가 (커뮤니티 조회 시)
// ✅ 조회수 증가 (삭제되지 않은 게시글만)
export const incrementViews = async (id) => {
    return await Community.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { $inc: { communityViews: 1 } },
        { new: true }
    );
};

// 추천 기능: 사용자별로 한 번만 추천할 수 있도록 처리
// ✅ 추천 기능 (삭제되지 않은 게시글만)
export const recommendCommunity = async (id, userId) => {
    const community = await Community.findOne({ _id: id, isDeleted: false });
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
    // ✅ 익명 댓글 처리
    if (commentData.isAnonymous) {
        // commentData.anonymousNickname = generateAnonymousNickname();
        // 또는 단순히 '익명' 처리는 프론트엔드에서
    }

    return Community.findByIdAndUpdate(
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
    // ✅ 익명 대댓글 처리
    if (replyData.isAnonymous) {
        // replyData.anonymousNickname = generateAnonymousNickname();
    }

    return await Community.findOneAndUpdate(
        { _id: communityId, "comments._id": commentId },
        {
            $push: { "comments.$.replies": replyData },
            $inc: { commentCount: 1 }
        },
        { new: true }
    );
};

// 대대댓글 추가: community.comments 배열 내에서 특정 comment와 그 reply를 찾아 subReplies에 추가
export const addSubReply = async (communityId, commentId, replyId, subReplyData) => {
    // ✅ 익명 대대댓글 처리
    if (subReplyData.isAnonymous) {
        // subReplyData.anonymousNickname = generateAnonymousNickname();
    }

    return await Community.findOneAndUpdate(
        { _id: communityId },
        {
            $push: { "comments.$[c].replies.$[r].subReplies": subReplyData },
            $inc: { commentCount: 1 }
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
// ✅ 개선된 댓글 삭제: 자식 댓글 존재 여부에 따른 처리
export const deleteComment = async (communityId, commentId) => {
    // 먼저 해당 댓글을 찾아서 자식 댓글이 있는지 확인
    const community = await Community.findOne(
        {
            _id: communityId,
            "comments._id": commentId,
            isDeleted: false
        }
    );

    if (!community) {
        throw new Error("댓글을 찾을 수 없습니다.");
    }

    const comment = community.comments.id(commentId);

    // 자식 댓글(대댓글, 대대댓글)이 있는지 확인
    const hasReplies = comment.replies && comment.replies.some(reply =>
        !reply.isDeleted || (reply.subReplies && reply.subReplies.some(sub => !sub.isDeleted))
    );

    if (hasReplies) {
        // 자식 댓글이 있으면: 내용만 변경하고 삭제 표시, commentCount는 감소하지 않음
        return await Community.findOneAndUpdate(
            {
                _id: communityId,
                "comments._id": commentId,
                isDeleted: false
            },
            {
                $set: {
                    "comments.$.isDeleted": true,
                    "comments.$.deletedAt": new Date(),
                    "comments.$.commentContents": "삭제된 댓글입니다."
                },
                $inc: { commentCount: -1 }
            },
            { new: true }
        );
    } else {
        // 자식 댓글이 없으면: 완전히 삭제하고 commentCount 감소
        return await Community.findOneAndUpdate(
            {
                _id: communityId,
                "comments._id": commentId,
                isDeleted: false
            },
            {
                $set: {
                    "comments.$.isDeleted": true,
                    "comments.$.deletedAt": new Date()
                },
                $inc: { commentCount: -1 }
            },
            { new: true }
        );
    }
};


// 대댓글 삭제: 특정 댓글 내의 replies 배열에서 해당 대댓글 삭제
// ✅ 대댓글 soft delete
// 대댓글 삭제: 자식 댓글(대대댓글) 존재 여부에 따른 처리
// 대댓글 삭제: 자식 댓글(대대댓글) 존재 여부에 따른 처리
export const deleteReply = async (communityId, commentId, replyId) => {
    // 삭제된 댓글에서도 대댓글을 찾을 수 있도록 isDeleted 조건 제거
    const community = await Community.findOne({
        _id: communityId,
        isDeleted: false,
        "comments._id": commentId
        // "comments.isDeleted": false 조건 제거
    });

    if (!community) {
        throw new Error("대댓글을 찾을 수 없습니다.");
    }

    const comment = community.comments.id(commentId);
    if (!comment) {
        throw new Error("댓글을 찾을 수 없습니다.");
    }

    const reply = comment.replies.id(replyId);
    if (!reply || reply.isDeleted) { // 이미 삭제된 대댓글인지 확인
        throw new Error("대댓글을 찾을 수 없습니다.");
    }

    // 자식 댓글(대대댓글)이 있는지 확인
    const hasSubReplies = reply.subReplies && reply.subReplies.some(subReply => !subReply.isDeleted);

    if (hasSubReplies) {
        // 자식 댓글(대대댓글)이 있으면: 내용만 변경하고 삭제 표시
        return await Community.findOneAndUpdate(
            {
                _id: communityId,
                isDeleted: false,
                "comments._id": commentId
                // "comments.isDeleted": false 조건 제거
            },
            {
                $set: {
                    "comments.$[c].replies.$[r].isDeleted": true,
                    "comments.$[c].replies.$[r].deletedAt": new Date(),
                    "comments.$[c].replies.$[r].commentContents": "삭제된 댓글입니다."
                },
                $inc: { commentCount: -1 }
            },
            {
                new: true,
                arrayFilters: [
                    { "c._id": commentId },
                    { "r._id": replyId }
                ]
            }
        );
    } else {
        // 자식 댓글이 없으면: 삭제 표시하고 commentCount 감소
        return await Community.findOneAndUpdate(
            {
                _id: communityId,
                isDeleted: false,
                "comments._id": commentId
                // "comments.isDeleted": false 조건 제거
            },
            {
                $set: {
                    "comments.$[c].replies.$[r].isDeleted": true,
                    "comments.$[c].replies.$[r].deletedAt": new Date()
                },
                $inc: { commentCount: -1 }
            },
            {
                new: true,
                arrayFilters: [
                    { "c._id": commentId },
                    { "r._id": replyId }
                ]
            }
        );
    }
};



// 대대댓글 삭제: 특정 댓글의 대댓글 내부 subReplies 배열에서 해당 대대댓글 삭제 (arrayFilters 사용)
// ✅ 대대댓글 soft delete
export const deleteSubReply = async (communityId, commentId, replyId, subReplyId) => {
    return await Community.findOneAndUpdate(
        {
            _id: communityId,
            isDeleted: false
        },
        {
            $set: {
                "comments.$[c].replies.$[r].subReplies.$[s].isDeleted": true,
                "comments.$[c].replies.$[r].subReplies.$[s].deletedAt": new Date()
            },
            $inc: { commentCount: -1 }
        },
        {
            new: true,
            arrayFilters: [
                { "c._id": commentId },
                { "r._id": replyId },
                { "s._id": subReplyId }
            ]
        }
    );
};

// 아래는 24시간마다 집계 결과를 갱신하기 위한 캐시와 관련 함수입니다.

// 전역 캐시 변수
let cachedTopViewed = [];
let cachedTopCommented = [];

// 캐시를 업데이트하는 함수
// ✅ 캐시 업데이트 함수들도 수정
// 캐시를 업데이트하는 함수
export const updateTopCaches = async () => {
    try {
        cachedTopViewed = await Community.aggregate([
            { $match: { isDeleted: false } }, // ✅ 삭제되지 않은 것만
            { $sort: { communityViews: -1 } },
            { $limit: 10 },
            { $project: { communityTitle: 1, communityViews: 1 } }
        ]);

        cachedTopCommented = await Community.aggregate([
            { $match: { isDeleted: false } }, // ✅ 삭제되지 않은 것만
            {
                $addFields: {
                    totalComments: {
                        $sum: [
                            // 댓글 수 (isDeleted: false인 것만)
                            {
                                $size: {
                                    $filter: {
                                        input: '$comments',
                                        cond: { $eq: ['$$this.isDeleted', false] }
                                    }
                                }
                            },
                            // 대댓글 수 (isDeleted: false인 것만)
                            {
                                $sum: {
                                    $map: {
                                        input: {
                                            $filter: {
                                                input: '$comments',
                                                cond: { $eq: ['$$this.isDeleted', false] }
                                            }
                                        },
                                        as: 'comment',
                                        in: {
                                            $size: {
                                                $filter: {
                                                    input: '$$comment.replies',
                                                    cond: { $eq: ['$$this.isDeleted', false] }
                                                }
                                            }
                                        }
                                    }
                                }
                            },
                            // 대대댓글 수 (isDeleted: false인 것만)
                            {
                                $sum: {
                                    $map: {
                                        input: {
                                            $filter: {
                                                input: '$comments',
                                                cond: { $eq: ['$$this.isDeleted', false] }
                                            }
                                        },
                                        as: 'comment',
                                        in: {
                                            $sum: {
                                                $map: {
                                                    input: {
                                                        $filter: {
                                                            input: '$$comment.replies',
                                                            cond: { $eq: ['$$this.isDeleted', false] }
                                                        }
                                                    },
                                                    as: 'reply',
                                                    in: {
                                                        $size: {
                                                            $filter: {
                                                                input: '$$reply.subReplies',
                                                                cond: { $eq: ['$$this.isDeleted', false] }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        ]
                    }
                }
            },
            { $sort: { totalComments: -1 } },
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



