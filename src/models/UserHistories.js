// src/models/UserHistories.js
import mongoose from "mongoose";

const { Schema, model } = mongoose;

// 닉네임 히스토리 스키마
const nicknameHistorySchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true  // 조회 성능을 위한 인덱스
    },
    oldNickname: {
        type: String,
        default: null  // 회원가입 시에는 null
    },
    newNickname: {
        type: String,
        required: true
    },
    changeReason: {
        type: String,
        enum: ['signup', 'user_change', 'admin_change', 'auto_change'],
        default: 'user_change'  // 'signup': 회원가입, 'user_change': 사용자 변경, 'admin_change': 관리자 변경, 'auto_change': 시스템 자동 변경
    },
    changedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true  // 변경한 사용자 (자신이거나 관리자)
    },
    ipAddress: {
        type: String,
        default: ''
    },
    userAgent: {
        type: String,
        default: ''
    }
}, {
    timestamps: true  // createdAt, updatedAt 자동 생성
});

// 성별 히스토리 스키마
const genderHistorySchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    oldGender: {
        type: String,
        enum: ['male', 'female', 'select', null],
        default: null  // 회원가입 시에는 null
    },
    newGender: {
        type: String,
        enum: ['male', 'female', 'select'],
        required: true
    },
    changeReason: {
        type: String,
        enum: ['signup', 'user_change', 'admin_change', 'auto_change'],
        default: 'user_change'
    },
    changedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    ipAddress: {
        type: String,
        default: ''
    },
    userAgent: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// 복합 인덱스 (성능 최적화)
nicknameHistorySchema.index({ userId: 1, changeReason: 1, createdAt: -1 });
genderHistorySchema.index({ userId: 1, changeReason: 1, createdAt: -1 });

// 모델 생성 및 내보내기
export const NicknameHistory = model('NicknameHistory', nicknameHistorySchema);
export const GenderHistory = model('GenderHistory', genderHistorySchema);
