import mongoose from 'mongoose';                     // mongoose 모듈 불러오기
const { Schema, model } = mongoose;                  // Schema, model 생성자 추출

/**
 * recentMatchSchema
 * - 최근 경기 정보를 저장하는 서브 스키마입니다.
 * - champion: 해당 경기에서 사용한 챔피언 이름 또는 ID
 * - result: 경기 결과 ('win' 또는 'loss')
 * - playedAt: 경기가 진행된 시각
 * - _id: false 옵션으로 서브 도큐먼트에 별도 _id 생성 방지
 */
const recentMatchSchema = new Schema({
    champion: {                                        // 사용한 챔피언 정보
        type: String,
        required: true
    },
    result: {                                          // 경기 결과: 'win' 또는 'loss'
        type: String,
        enum: ['win', 'loss'],
        required: true
    },
    playedAt: {                                        // 경기 발생 시각
        type: Date,
        default: Date.now
    }
}, { _id: false });                                  // 별도의 _id 생성 안 함

/**
 * lolStatsSchema
 * - 리그 오브 레전드 전적 정보를 저장하는 서브 스키마입니다.
 * - nickname: 게임 내 닉네임(소환사 이름)
 * - overallWinRate: 전체 승률 (예: 52.3)
 * - recent20WinRate: 최근 20게임 승률 (예: 60.0)
 * - gameTier: 게임 티어 (예: "Gold IV")
 * - recentMatches: 최근 경기 내역 배열 (예: 최근 10게임 승패 기록)
 * - _id: false 옵션으로 별도의 _id 생성 방지
 */
const lolStatsSchema = new Schema({

    overallWinRate: {                                  // 전체 승률 (%)
        type: Number,
        required: true,
        default: 0
    },
    recent20WinRate: {                                 // 최근 20게임 승률 (%)
        type: Number,
        required: true,
        default: 0
    },
    gameTier: {                                        // 게임 티어 (예: "Gold IV")
        type: String,
        required: true,
        default: ''
    },
    // recentMatches: {                                   // 최근 경기 내역 배열 (예: 최근 10경기)
    //     type: [recentMatchSchema],
    //     default: []                                      // 기본값은 빈 배열
    // }
}, { _id: false });                                  // 서브 스키마에 _id 생성 안 함

/**
 * tftStatsSchema
 * - 전략적 팀전투(TFT) 전적 정보를 저장하는 서브 스키마입니다.
 * - nickname: TFT 게임 내 닉네임
 * - overallWinRate: 전체 승률 (%)
 * - recent20WinRate: 최근 20게임 승률 (%)
 * - gameTier: 게임 티어 (예: "Silver")
 * - recentMatches: 최근 경기 내역 배열 (예: 최근 10경기 승패 기록)
 * - _id: false 옵션으로 별도의 _id 생성 방지
 */
const tftStatsSchema = new Schema({

    overallWinRate: {                                  // 전체 승률 (%)
        type: Number,
        required: true,
        default: 0
    },
    recent20WinRate: {                                 // 최근 20게임 승률 (%)
        type: Number,
        required: true,
        default: 0
    },
    gameTier: {                                        // 게임 티어 (예: "Silver")
        type: String,
        required: true,
        default: ''
    },
    recentMatches: {                                   // 최근 경기 내역 배열 (예: 최근 10경기)
        // type: [],
        default: []
    }
}, { _id: false });                                  // 서브 스키마에 _id 생성 안 함

/**
 * RiotProfile 스키마
 * - 라이엇 계정 연동 전적 정보를 저장하는 메인 스키마입니다.
 * - user: 해당 전적 정보가 연결된 유저의 ObjectId (User 컬렉션 참조)
 * - lol: 리그 오브 레전드 전적 정보를 저장하는 서브 도큐먼트
 * - tft: 전략적 팀전투(TFT) 전적 정보를 저장하는 서브 도큐먼트
 */
const riotProfileSchema = new Schema({
    riotUser: {
        type: Schema.Types.ObjectId,                   // 이 전적 정보가 연결된 사용자의 고유 ID
        ref: 'User',                                   // User 컬렉션 참조
        required: true,                                // 필수 항목
        unique: true                                   // 한 유저당 하나의 RiotProfile만 존재하도록 설정
    },
    nickname: {
        type: String,                                  // 라이엇 계정의 공통 닉네임
        required: true,                                // 필수 항목
        default: ''
    },
    lol: {
        type: lolStatsSchema,                          // 리그 오브 레전드 전적 정보
        required: true,                                // 필수 항목
        default: {}                                    // 기본값은 빈 객체
    },
    tft: {
        type: tftStatsSchema,                          // 전략적 팀전투 전적 정보
        required: true,                                // 필수 항목
        default: {}                                    // 기본값은 빈 객체
    }
}, { timestamps: true });                          // createdAt, updatedAt 필드를 자동 관리

// RiotProfile 모델을 'RiotProfile' 컬렉션으로 생성하여 내보냅니다.
export const RiotProfile = model('RiotProfile', riotProfileSchema);
