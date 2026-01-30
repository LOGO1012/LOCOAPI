// src/models/Community.js

import mongoose from 'mongoose';
import { User } from './UserProfile.js';
import { pollSchema } from './Poll.js';

const { Schema, model } = mongoose;

// 게시물 스키마
const communitySchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // ✅ 익명 작성 여부 추가
    isAnonymous: {
        type: Boolean,
        default: false,
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
    commentedUserIds: [{ // Added for '내 댓글' category optimization
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    polls: [pollSchema],
}, { timestamps: true });

// 기존 인덱스들...
communitySchema.index({
    communityTitle: 'text',
    communityContents: 'text'
});

communitySchema.index({ communityTitle: 1 });
communitySchema.index({ communityContents: 1 });
communitySchema.index({ isDeleted: 1 });
communitySchema.index({ createdAt: -1 });
communitySchema.index({ isDeleted: 1, createdAt: -1 });
communitySchema.index({ isDeleted: 1, communityCategory: 1, createdAt: -1 }); // Added
communitySchema.index({ isDeleted: 1, userId: 1, createdAt: -1 }); // Added
communitySchema.index({ isDeleted: 1, communityViews: -1 });
communitySchema.index({ isDeleted: 1, recommended: -1 });
communitySchema.index({ communityViews: -1, createdAt: -1 });
communitySchema.index({ isDeleted: 1, createdAt: -1, communityViews: -1 });
communitySchema.index({ isDeleted: 1, createdAt: -1, recommended: -1 });


export const Community = model('Community', communitySchema);
