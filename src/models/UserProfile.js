//PASS 받아오는거 어디넣을지
import mongoose from "mongoose";
import { encrypt, decrypt } from '../utils/encryption.js';

const {Schema, model} = mongoose; // Schema 생성자 추출

// User 스키마 정의
const userSchema = new Schema({
    // 기본 프로필 정보
    name: {
        type: String,           // 이름: 사용자의 전체 이름
        // required: true          // 필수 항목
        set: function(value) {
            return value ? encrypt(value) : value;
        },
        get: function(value) {
            return value ? decrypt(value) : value;
        }
    },
    nickname: {
        type: String,           // 닉네임: 사용자가 표시할 별명
        required: true,         // 필수 항목
        unique: true,           // 닉네임 유니크 설정(중복제거)
        trim: true               // 공백 제거
    },
    gender: {
        type: String,           // 성별: 사용자의 성별
        enum: ['male', 'female', 'select'], // 허용 값: 남성, 여성, 기타
        default: 'select'
    },
    // 추가 연락처 정보
    phone: {
        type: String,           // 전화번호: 사용자의 휴대폰 번호
        default: '',             // 기본값은 빈 문자열
        // required: true
        set: function(value) {
            return value ? encrypt(value) : value;
        },
        get: function(value) {
            return value ? decrypt(value) : value;
        }
    },
    pass: {
        type: String,
        required: false // 실제로 비밀번호를 저장할 계획이라면 required: true 로 설정하고, 해시 처리를 고려하세요.
    },
    birthdate: {
        type: String,             // 생년월일: 사용자의 생년월일 정보
        default: null,
        // required: true // 기본값은 null
        set: function(value) {
            return value ? encrypt(value) : value;
        },
        get: function(value) {
            return value ? decrypt(value) : value;
        }
    },
    coinLeft: {
        type: Number,           // 남은 재화: 사용자가 보유한 코인 또는 재화 수량
        default: 0              // 기본값은 0
    },
    accountLink: {
        type: String,           // 연동된 계정: 소셜 로그인 등 외부 계정 정보(예: provider의 식별자)
        kakao: {
            type: String,
            default: null
        },                       // 카카오 연동
        liot: {
            type: String,
            default: null
        },                      // 라이엇 연동
        nexon: {
            type: String,
            default: null
        },                      // 넥슨 연동
        default: ''             // 기본값은 빈 문자열
    },
    // 소셜 로그인 정보 (추가 선택 사항)
    social: {
        kakao: {
            providerId: {                   // 카카오에서 발급받은 고유 ID (예: 1234567890)
                type: String,
                default: ''
            },
            name: {                     // 카카오에서 받아온 닉네임
                type: String,
                default: '',
                set: function(value) {
                    return value ? encrypt(value) : value;
                },
                get: function(value) {
                    return value ? decrypt(value) : value;
                }
            },
            phoneNumber: {                        // 카카오에서 제공한 이메일
                type: String,
                default: '',
                set: function(value) {
                    return value ? encrypt(value) : value;
                },
                get: function(value) {
                    return value ? decrypt(value) : value;
                }
            },
            birthday: {                 // 카카오에서 받아온 프로필 이미지 URL
                type: Number,
                default: ''
            },
            birthyear: {                 // 카카오에서 받아온 프로필 이미지 URL
                type: Number,
                default: ''
            },
            gender: {                 // 카카오에서 받아온 프로필 이미지 URL
                type: String,           // 성별: 사용자의 성별
                enum: ['male', 'female', ''], // 허용 값: 남성, 여성, 기타
                default: ''
            }
        },
        naver: {
            providerId: {                   // 네이버에서 발급받은 고유 ID
                type: String,
                default: ''
            },
            name: {                         // 네이버에서 받아온 이름
                type: String,
                default: '',
                set: function(value) {
                    return value ? encrypt(value) : value;
                },
                get: function(value) {
                    return value ? decrypt(value) : value;
                }
            },
            phoneNumber: {                  // 네이버에서 받아온 전화번호 (필요 시)
                type: String,
                default: '',
                set: function(value) {
                    return value ? encrypt(value) : value;
                },
                get: function(value) {
                    return value ? decrypt(value) : value;
                }
            },
            birthday: {                     // 네이버에서 받아온 생일 정보
                type: String,
                default: ''
            },
            gender: {                       // 네이버에서 받아온 성별 정보
                type: String,
                enum: ['male', 'female', ''],
                default: ''
            }
        }
    },
    // 게임 관련 정보
    lolNickname: {
        type: String,           // 리그 오브 레전드 닉네임
        default: '',
        index: true             // 검색을 위한 인덱스 설정
    },
    // 추가된 필드들
    tier: {
        type: String,           // 게임 티어 정보
        default: ''
    },
    profile: {
        type: String,           // 프로필 이미지 URL
        default: ''
    },
    userLv: {
        type: Number,           // 사용자 레벨 (권한 관리용)
        default: 1              // 기본값: 일반 사용자
    },
    
    // 친구 관리
    friends: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    
    // 차단된 사용자 목록
    blockedUsers: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    
    // 평점 시스템
    ratings: [{
        rater: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        rating: {
            type: Number,
            min: 1,
            max: 5,
            required: true
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    
    // 채팅 쿼터 시스템
    chatQuota: {
        current: {
            type: Number,
            default: 10
        },
        lastRefillTime: {
            type: Date,
            default: Date.now
        }
    },
    
    // 마지막 활동 시간
    lastActive: {
        type: Date,
        default: Date.now
    }
}, { 
    timestamps: true,           // createdAt, updatedAt 자동 생성
    toJSON: { getters: true },  // JSON 변환 시 getter 실행 (복호화)
    toObject: { getters: true } // Object 변환 시 getter 실행 (복호화)
});

// 기존 인덱스는 그대로 유지 (암호화된 데이터도 인덱스 가능)
userSchema.index({name: "text", nickname: "text", phone: "text", gender: "text", birthdate: "text", userLv: "text"});

// lolNickname을 분리해 gameName, tagLine 가상 필드로 노출
userSchema.virtual('riotGameName').get(function () {
    if (!this.lolNickname) return '';
    return this.lolNickname.split('#')[0] || '';
});

userSchema.virtual('riotTagLine').get(function () {
    if (!this.lolNickname) return '';
    const parts = this.lolNickname.split('#');
    return parts[1] || '';
});

// JSON으로 반환될 때 virtual 포함
userSchema.set('toJSON', {virtuals: true});
userSchema.set('toObject', {virtuals: true});

//      모델을 'User' 컬렉션으로 생성 및 내보내기
export const User = model('User', userSchema);


// lastActive: {
//     type: Date,             // 마지막 활동 시간 (예: 채팅, 페이지 방문 등)
//     default: null
// },

// // 사용자 환경 설정 (옵션)
// preferences: {
//     theme: {
//         type: String,         // 테마: 'light', 'dark' 등
//         default: 'light'
//     },
//     language: {
//         type: String,         // 언어 설정
//         default: 'ko'
//     }
//     // 추가적인 환경 설정 항목들 추가 가능
// },

// // 보안 관련 (로그인 시도 관리)
// loginAttempts: {
//     type: Number,           // 로그인 실패 횟수
//     default: 0
// },
// lockUntil: {
//     type: Date,             // 계정이 잠긴 시각 (로그인 실패가 누적되면 잠금 해제 시각)
//     default: null
// }
