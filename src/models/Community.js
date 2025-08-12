// src/models/Community.js

import mongoose from 'mongoose';
import { User } from './UserProfile.js';

const { Schema, model } = mongoose;

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
    // ✅ Soft delete 필드 추가
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
    // ✅ Soft delete 필드 추가
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
    // ✅ Soft delete 필드 추가
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
    replies: [replySchema],
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
    // ✅ Soft delete 필드 추가
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
}, { timestamps: true });

// 인덱스 설정
communitySchema.index({
    communityTitle: 'text',
    communityContents: 'text'
});

communitySchema.index({ communityTitle: 1 });
communitySchema.index({ communityContents: 1 });
communitySchema.index({ authorNickname: 1 });
// ✅ Soft delete 조회 성능을 위한 인덱스 추가
communitySchema.index({ isDeleted: 1 });

export const Community = model('Community', communitySchema);
