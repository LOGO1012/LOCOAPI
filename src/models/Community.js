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
}, { timestamps: true });

// 대댓글 스키마 (대대댓글 포함)
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
    // 대대댓글 배열 추가
    subReplies: [subReplySchema],
}, { timestamps: true });

// 댓글 스키마 (대댓글 포함) – 댓글에 사진 첨부 지원
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
    replies: [replySchema],
}, { timestamps: true });

// 게시물 스키마
const communitySchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
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
        enum: ['자유', '유머', '질문', '사건사고', '전적인증'],
    },
    communityRegDate: {
        type: Date,
        default: Date.now,
    },
    communityImage: {
        type: String,
        default: null,
    },
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
}, { timestamps: true });

communitySchema.index({
    communityTitle: 'text',
    communityContents: 'text'
});
// B‑Tree 인덱스: 정확 일치(zero‑scanned regex) 또는 anchored regex (접두사) 시 IXSCAN
communitySchema.index({ communityTitle: 1 });
communitySchema.index({ communityContents: 1 });
communitySchema.index({ userId: 1 });

export const Community = model('Community', communitySchema);
