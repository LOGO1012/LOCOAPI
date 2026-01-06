// src/models/AccessLog.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const accessLogSchema = new Schema({
    // 1. 누가 (Who)
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: false,
        index: true // 유저별 접속 기록 조회용 인덱스
    },

    // 2. 어디서 (Where - IP)
    ip: {
        type: String,
        required: true
    },

    // 3. 무엇을 (What - Action)
    action: {
        type: String,
        enum: [
            'login',              // 로그인 성공
            'logout',             // 로그아웃
            'token_refresh',      // 토큰 재발급
            'socket_connect',     // 소켓 연결 (채팅방 입장 등)
            'socket_reconnect',   // 소켓 재연결 (새로고침, 네트워크 변경)
            'withdraw'            // 회원 탈퇴
        ],
        required: true
    },

    // 4. 어떤 기기로 (Device)
    userAgent: {
        type: String,
        required: false // 가끔 헤더에 없을 수도 있음
    },

    // 5. 상태 (Status) - 로그인 실패/성공 여부 (선택사항)
    status: {
        type: String,
        enum: ['success', 'fail'],
        default: 'success'
    },

    // 6. 언제 (When)
    createdAt: {
        type: Date,
        default: Date.now,
        index: true // 시간 기반 조회 최적화
    }
});

// 복합 인덱스: 유저 + 시간 조회 최적화
accessLogSchema.index({ user: 1, createdAt: -1 });

// TTL 인덱스는 스케줄러를 통한 조건부 삭제를 위해 제거합니다.

// 모델 생성 및 export
export const AccessLog = model('AccessLog', accessLogSchema);
