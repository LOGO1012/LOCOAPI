
import mongoose from "mongoose";
import { User }from './UserProfile.js';

const { Schema, model } = mongoose;

//서든어택 통합 전적 스키마
const suddenAttackOverallStatsSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    suddenId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    }, // 계정 ID
    totalKDA: {
        kills: {
            type: Number,
            required: true,
            default: 0
        }, // 총 킬 수
        deaths: {
            type: Number,
            required: true,
            default: 0
        }, // 총 데스 수
        assists: {
            type: Number,
            required: true,
            default: 0
        } // 총 어시스트 수
    },
    suddenAccuary: {
        type: Number,
        required: true,
        default: 0
    }, // 평균 명중률
}, { timestamps: true }); // createdAt, updatedAt 자동 생성

export const SuddenAttackOverallStatsModel = model('SuddenAttackOverallStats', suddenAttackOverallStatsSchema);

//서든어택 랭크 전적 스키마
const suddenAttackRankSchema = new Schema({
    userId: {},
    suddenId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    }, // 계정 ID
    suddenRank: {
        type: String,
        required: true
    }, // 랭크
    suddenWins: {
        type: Number,
        required: true,
        default: 0
    }, // 승리 수
    suddenLosses: {
        type: Number,
        required: true,
        default: 0
    }, // 패배 수
    suddenTotalMatches: {
        type: Number,
        required: true,
        default: 0
    }, // 총 매치 수
    suddenAccuracy: {
        type: Number,
        required: true,
        default: 0
    }, // 명중률
    suddenRankKDA: {
        kills: {
            type: Number,
            required: true,
            default: 0
        }, // 킬 수
        deaths: {
            type: Number,
            required: true,
            default: 0
        }, // 데스 수
        assists: {
            type: Number,
            required: true,
            default: 0
        } // 어시스트 수
    },
}, { timestamps: true }); // createdAt, updatedAt 자동 생성

export const SuddenAttackRankModel = model('SuddenAttackRank', suddenAttackRankSchema);



