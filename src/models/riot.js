// src/models/riot.js
// 라이엇 전적 저장용 스키마

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * 개별 매치 스키마
 * - 최근 경기 정보를 저장하는 서브 스키마
 */
const matchSchema = new Schema({
    matchId: {
        type: String,
        required: true
    },
    champion: {
        type: String,
        required: true
    },
    championImage: {
        type: String,
        required: true
    },
    win: {
        type: Boolean,
        required: true
    },
    kills: {
        type: Number,
        required: true
    },
    deaths: {
        type: Number,
        required: true
    },
    assists: {
        type: Number,
        required: true
    },
    kda: {
        type: Number,
        required: true
    },
    lane: {
        type: String,
        required: true
    },
    duration: {
        type: Number,
        required: true
    },
    playedAt: {
        type: Date,
        required: true
    }
}, { _id: false });

/**
 * 라이엇 전적 캐시 스키마 (LoL Record)
 * - Riot ID 기반 전적 캐싱
 * - 갱신 버튼 클릭 시에만 업데이트
 */
const lolRecordSchema = new Schema({
    // Riot ID 정보
    gameName: {
        type: String,
        required: true,
        index: true
    },
    tagLine: {
        type: String,
        required: true
    },
    puuid: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // 랭크 정보
    tier: {
        type: String,
        default: 'UNRANKED'
    },
    rank: {
        type: String,
        default: ''
    },
    leaguePoints: {
        type: Number,
        default: 0
    },
    overallWinRate: {
        type: Number,
        default: 0
    },

    // 최근 10판 매치 데이터
    matches: {
        type: [matchSchema],
        default: [],
        validate: [arr => arr.length <= 15, '매치는 최대 15개까지 저장됩니다.'] // 배치 삭제 전 여유분
    },

    // 갱신 메타 정보
    lastUpdatedAt: {
        type: Date,
        default: null,
        index: true
    }
}, {
    timestamps: true
});

// 복합 인덱스: gameName + tagLine으로 빠른 조회
lolRecordSchema.index({ gameName: 1, tagLine: 1 }, { unique: true });

/**
 * 기존 RiotProfile 스키마 (사용자 연동용 - 하위 호환)
 * - 사용자와 라이엇 계정 연동 정보
 */
const riotProfileSchema = new Schema({
    riotUser: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    nickname: {
        type: String,
        required: true,
        default: ''
    },
    lol: {
        overallWinRate: { type: Number, default: 0 },
        recent20WinRate: { type: Number, default: 0 },
        gameTier: { type: String, default: '' }
    },
    tft: {
        overallWinRate: { type: Number, default: 0 },
        recent20WinRate: { type: Number, default: 0 },
        gameTier: { type: String, default: '' },
        recentMatches: { type: Array, default: [] }
    }
}, { timestamps: true });

// 모델 export
export const LoLRecord = model('LoLRecord', lolRecordSchema);
export const RiotProfile = model('RiotProfile', riotProfileSchema);
