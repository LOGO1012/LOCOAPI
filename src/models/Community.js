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
