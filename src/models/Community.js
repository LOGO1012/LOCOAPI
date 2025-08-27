// src/models/Community.js

import mongoose from 'mongoose';
import { User } from './UserProfile.js';

const { Schema, model } = mongoose;

// 투표 옵션 스키마
const pollOptionSchema = new Schema({
    text: {
        type: String,
        required: true,
        maxlength: 50
    },
    votes: {
        type: Number,
        default: 0
    },
    votedUsers: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }]
});

// 투표 스키마
const pollSchema = new Schema({
    question: {
        type: String,
        required: true,
        maxlength: 100
    },
    options: [pollOptionSchema],
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    totalVotes: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// 대대댓글 스키마
const subReplySchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    commentContents: {
        type: String,
        required: true,
    },
    subReplyImage: {
        type: String,
        default: null,
    },
    commentRegDate: {
        type: Date,
        default: Date.now,
    },
    // ✅ 익명 작성 여부 추가
    isAnonymous: {
        type: Boolean,
        default: false,
    },
    // ✅ 익명일 때 표시할 닉네임 (선택사항)
    anonymousNickname: {
        type: String,
        default: null,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
}, { timestamps: true });

// 대댓글 스키마
const replySchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    commentContents: {
        type: String,
        required: true,
    },
    replyImage: {
        type: String,
        default: null,
    },
    commentRegDate: {
        type: Date,
        default: Date.now,
    },
    // ✅ 익명 작성 여부 추가
    isAnonymous: {
        type: Boolean,
        default: false,
    },
    // ✅ 익명일 때 표시할 닉네임 (선택사항)
    anonymousNickname: {
        type: String,
        default: null,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
    subReplies: [subReplySchema],
}, { timestamps: true });

// 댓글 스키마
const commentSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    commentContents: {
        type: String,
        required: true,
    },
    commentImage: {
        type: String,
        default: null,
    },
    commentRegDate: {
        type: Date,
        default: Date.now,
    },
    // ✅ 익명 작성 여부 추가
    isAnonymous: {
        type: Boolean,
        default: false,
    },
    // ✅ 익명일 때 표시할 닉네임 (선택사항)
    anonymousNickname: {
        type: String,
        default: null,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
    replies: [replySchema],
    polls: [pollSchema],
}, { timestamps: true });

// 게시물 스키마
const communitySchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    userNickname: {
        type: String,
        default: ''
    },
    // ✅ 익명 작성 여부 추가
    isAnonymous: {
        type: Boolean,
        default: false,
    },
    // ✅ 익명일 때 표시할 닉네임 (선택사항)
    anonymousNickname: {
        type: String,
        default: null,
    },
    communityTitle: {
        type: String,
        required: true,
    },
    communityContents: {
        type: String,
        required: true,
    },
    communityCategory: {
        type: String,
        required: true,
        enum: ['자유', '유머', '질문', '사건사고', '전적인증', '개발요청'],
    },
    communityRegDate: {
        type: Date,
        default: Date.now,
    },
    communityImages: [{
        type: String,
        required: false
    }],
    recommended: {
        type: Number,
        default: 0,
    },
    recommendedUsers: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    communityViews: {
        type: Number,
        default: 0,
    },
    comments: [commentSchema],
    commentCount: {
        type: Number,
        default: 0,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
    polls: [pollSchema],
}, { timestamps: true });

// 기존 인덱스들...
communitySchema.index({
    communityTitle: 'text',
    communityContents: 'text'
});

communitySchema.index({ communityTitle: 1 });
communitySchema.index({ communityContents: 1 });
communitySchema.index({ authorNickname: 1 });
communitySchema.index({ isDeleted: 1 });
// ✅ 최근 일주일 필터링을 위한 인덱스 추가
communitySchema.index({ createdAt: -1 }); // 날짜 정렬용
communitySchema.index({ isDeleted: 1, createdAt: -1 }); // 복합 인덱스 (필터링과 정렬)
communitySchema.index({ communityViews: -1, createdAt: -1 }); // 조회수와 날짜 복합 인덱스
communitySchema.index({ isDeleted: 1, createdAt: -1, communityViews: -1 });
communitySchema.index({ isDeleted: 1, createdAt: -1, recommended: -1 });

export const Community = model('Community', communitySchema);
