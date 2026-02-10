//PASS 받아오는거 어디넣을지
import mongoose from "mongoose";
import ComprehensiveEncryption from '../utils/encryption/comprehensiveEncryption.js';

const {Schema, model} = mongoose; // Schema 생성자 추출

// User 스키마 정의
const userSchema = new Schema({
    // 기본 프로필 정보
    name: {
        type: String,           // 이름: 사용자의 전체 이름 (암호화됨)
        default: ''
    },
    // ✅ 새로운 검색용 해시 필드들 추가
    name_hash: {
        type: String,           // 실명 검색용 해시
        index: true
    },
    nickname: {
        type: String,           // 닉네임: 사용자가 표시할 별명
        required: true,         // 필수 항목
        unique: true,           // 닉네임 유니크 설정(중복제거)
        index: true,
        trim: true,              // 공백 제거
        minlength: 2,
        maxlength: 12
    },
    gender: {
        type: String,           // 성별: 사용자의 성별
        enum: ['male', 'female', 'select'], // 허용 값: 남성, 여성, 기타
        default: 'select'
    },
    // 추가 연락처 정보
    phone: {
        type: String,           // 전화번호: 사용자의 휴대폰 번호 (암호화됨)
        default: '',             // 기본값은 빈 문자열
    },
    phone_hash: {
        type: String,           // 전화번호 검색용 해시
        index: true
    },
    pass: {
        type: String,
        required: false
    },
    // 본인인증 관련 필드
    ci: {
        type: String,           // CI (연계정보) - 암호화 저장
        default: ''
    },
    ci_hash: {
        type: String,           // CI 검색/중복체크용 해시
        unique: true,
        sparse: true,           // null 허용 (본인인증 안 한 기존 유저)
        index: true
    },
    identityVerified: {
        type: Boolean,          // 본인인증 완료 여부
        default: false
    },
    identityVerifiedAt: {
        type: Date,             // 본인인증 완료 시각
        default: null
    },
    birthdate: {
        type: String,             // 생년월일: 사용자의 생년월일 정보 (암호화됨)
        default: '',
    },
    birthdate_hash: {
        type: String,           // 생년월일 검색용 해시
        index: true
    },
    // ❌ age 필드 완전 제거 (birthdate 기반 실시간 계산으로 대체)
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
    // 소셜 로그인 정보 (추가 선택 사항) - 암호화 적용
    social: {
        kakao: {
            providerId: {                   // 카카오에서 발급받은 고유 ID (점진적으로 해시로 변경)
                type: String,
                default: ''
            },
            providerId_hash: {              // ✅ 새로운 해시 필드
                type: String,
                index: true
            },
            name: {                     // 카카오에서 받아온 닉네임 (암호화됨)
                type: String,
                default: ''
            },
            phoneNumber: {                        // 카카오에서 제공한 전화번호 (암호화됨)
                type: String,
                default: ''
            },
            birthday: {                 // 카카오에서 받아온 생일 (암호화됨)
                type: String,
                default: ''
            },
            birthyear: {                 // 카카오에서 받아온 출생년도 (암호화됨)
                type: String,
                default: ''
            },
            gender: {                 // 카카오에서 받아온 성별 (평문 유지)
                type: String,           // 성별: 사용자의 성별
                enum: ['male', 'female', ''], // 허용 값: 남성, 여성, 기타
                default: ''
            }
        },
        naver: {
            providerId: {                   // 네이버에서 발급받은 고유 ID (점진적으로 해시로 변경)
                type: String,
                default: ''
            },
            providerId_hash: {              // ✅ 새로운 해시 필드
                type: String,
                index: true
            },
            name: {                         // 네이버에서 받아온 이름 (암호화됨)
                type: String,
                default: ''
            },
            phoneNumber: {                  // 네이버에서 받아온 전화번호 (암호화됨)
                type: String,
                default: ''
            },
            birthday: {                     // 네이버에서 받아온 생일 (암호화됨)
                type: String,
                default: ''
            },
            birthyear: {                    // 네이버에서 받아온 출생년도 (암호화됨)
                type: String,
                default: ''
            },
            gender: {                       // 네이버에서 받아온 성별 (평문 유지)
                type: String,
                enum: ['M', 'F', ''],
                default: ''
            },
            accessToken: {                  // ✅ 네이버 연동해제를 위한 access_token 저장 (평문)
                type: String,
                default: ''
            }
        },
        providerId: {
            type: String,         // 제공자로부터 받은 고유 ID
            default: ''
        },

    },
    profilePhoto: {
        type: String,   // 프로필 사진 URL
        default: ''     // 기본값: 빈 문자열
    },
    photo: {
        type: [String],  // 문자열 배열로 여러 이미지 URL을 저장
        default: [],  // 기본값은 빈 배열
    },
    info: {
        type: String,           // 자기소개: 사용자의 소개글
        default: ''             // 기본값은 빈 문자열
    },
    policy: {
        type: Boolean,          // 약관 동의: 사용자가 약관에 동의했는지 여부 (true: 동의, false: 미동의)
        default: false          // 기본값은 false
    },

    // 채팅 관련 정보
    numOfChat: {
        type: Number,           // 채팅 횟수: 사용자가 채팅한 총 횟수
        default: 0              // 기본값은 0
    },
    chatTimer: {
        type: Date,             // 채팅 충전 타이머: 다음 채팅 이용권 충전이 가능한 시각
        default: null          // 기본값은 null (설정되지 않음)
    },

    // 매너(별점) 관련 정보
    star: {
        type: Number,           // 별점 누적: 사용자가 받은 매너 별의 누적 점수 (한 번에 1씩 증가)
        default: 0,              // 기본값은 0
        index: true              // ◀◀◀ 인덱스 추가
    },
    // 유저 등급 및 권한 정보
    userLv: {
        type: Number,           // 유저 등급: 일반 사용자(예: 1)부터 관리자(더 높은 값) 등급 구분
        enum: [1, 2, 3],        // 1 = 유저 , 2 = 관리자, 3 = 우리(개발자)
        default: 1              // 기본값은 1 (일반 사용자)
    },
    // 접속 및 활동 기록
    lastLogin: {
        type: Date,             // 마지막 로그인 시간
        default: null,
        index: true              // ◀◀◀ 인덱스 추가
    },
    // 신고 누적 횟수
    numOfReport: {
        type: Number,
        default: 0
    },
    friends: [
        {
            type: Schema.Types.ObjectId,          // 각 친구는 User 컬렉션의 ObjectId를 참조
            ref: 'User'                           // 'User' 모델을 참조합니다.
        }
    ],
    // ——— 차단한 사용자 목록 ———
    blockedUsers: [
        {
            type: Schema.Types.ObjectId,
            ref: 'User'
        }
    ],
    plan: {

        planName: {
            type: String,       // 구독 상품명 보관
            default: ''         // 기본값은 빈 문자열
        },

        planType: {
            type: String,
            enum: ['none', 'basic', 'standard', 'premium', 'other'],
            default: 'none'
        },
        isPlan: {
            type: Boolean,
            default: false
        },
        startDate: {
            type: Date,
            default: null
        },
        endDate: {
            type: Date,
            default: null
        }
    },
    reportStatus: {
        type: String,
        enum: ['활성', '영구정지', '일시정지'],
        default: '활성'
    },
    reportTimer: {
        type: Date,
        default: null
    },
    //임시 후에 롤은 소셜로그인 할 것
    // 추가된 사용자 정보 필드들
    pubgNickname: {
        type: String,
        default: ''
    },
    suddenNickname: {
        type: String,
        default: ''
    },
    lolNickname: {
        type: String,
        default: ''
    },
    //qna는 나중에 스키마에서 땡겨올것
    qnaHistory: {
        type: [String], // 예를 들어 QnA 내역의 ID나 내용을 저장할 수 있습니다.
        default: []
    },
    // ❶ 스키마 중간 어딘가—알림 · 환경설정 섹션 추천
    friendReqEnabled: {
        type: Boolean,
        default: true      // 기존 동작과 동일한 초기값
    },
    // 채팅 미리보기 알림 설정
    chatPreviewEnabled: {
        type: Boolean,
        default: true // 기본값은 활성화
    },
    // 욕설 필터 설정 (만 19세 이상만 설정 가능)
    wordFilterEnabled: {
        type: Boolean,
        default: true // ✅ 기본값: ON (필터링 함)
    },
    // 명예의 전당 공개 여부
    isPublicPR: {
        type: Boolean,
        default: true
    },
    status: {
        type: String,
        enum: ['active', 'deactivated', 'archived'],
        default: 'active'
    },
    deactivatedAt: {
        type: Date,
        default: null
    },
    deactivationCount: {
        type: Number,
        default: 0
    },

}, {
    timestamps: true           // createdAt, updatedAt 필드를 자동으로 추가하여 생성 및 수정 시각 기록
});

// // 🎯 가상 필드로 실시간 나이 계산 (birthdate 기반)
// userSchema.virtual('calculatedAge').get(function() {
//   if (!this.birthdate) return null; // birthdate가 없으면 null 반환
//
//   try {
//     // 암호화된 생년월일 복호화
//     const decryptedBirthdate = ComprehensiveEncryption.decryptPersonalInfo(this.birthdate);
//     if (!decryptedBirthdate) return null;
//
//     // 한국 만 나이 계산
//     return ComprehensiveEncryption.calculateAge(decryptedBirthdate);
//   } catch (error) {
//     console.error('나이 계산 실패:', error);
//     return null;
//   }
// });
//
// // 🎯 나이 그룹 가상 필드
// userSchema.virtual('ageGroup').get(function() {
//   if (!this.birthdate) return null;
//
//   try {
//     const decryptedBirthdate = ComprehensiveEncryption.decryptPersonalInfo(this.birthdate);
//     if (!decryptedBirthdate) return null;
//
//     return ComprehensiveEncryption.getAgeGroup(decryptedBirthdate);
//   } catch (error) {
//     console.error('나이 그룹 계산 실패:', error);
//     return null;
//   }
// });
//
// // 🎯 미성년자 여부 가상 필드
// userSchema.virtual('isMinor').get(function() {
//   if (!this.birthdate) return null;
//
//   try {
//     const decryptedBirthdate = ComprehensiveEncryption.decryptPersonalInfo(this.birthdate);
//     if (!decryptedBirthdate) return null;
//
//     return ComprehensiveEncryption.isMinor(decryptedBirthdate);
//   } catch (error) {
//     console.error('미성년자 확인 실패:', error);
//     return null;
//   }
// });

// 텍스트 인덱스 (해시 필드 추가)
userSchema.index({name: "text", nickname: "text", phone: "text", gender: "text", birthdate: "text", userLv: "text"});

// ✅ 새로운 인덱스 설정 (암호화 지원)
userSchema.index({ nickname: "text" }); // 닉네임 검색
userSchema.index({ phone_hash: 1 }); // 전화번호 검색
userSchema.index({ name_hash: 1 }); // 실명 검색
userSchema.index({ gender: 1 }); // 성별 필터
userSchema.index({ "social.kakao.providerId_hash": 1 }); // 카카오 로그인
userSchema.index({ "social.naver.providerId_hash": 1 }); // 네이버 로그인
userSchema.index({ friends: 1 }); // 친구 배열 인덱스
userSchema.index({ blockedUsers: 1 }); // 차단 목록 인덱스

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