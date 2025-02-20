
//PASS 받아오는거 어디넣을지
const mongoose = require('mongoose'); // mongoose 모듈 불러오기
const { Schema } = mongoose; // Schema 생성자 추출

// User 스키마 정의
const userSchema = new Schema({
    // 기본 프로필 정보
    name: {
        type: String,           // 이름: 사용자의 전체 이름
        required: true          // 필수 항목
    },
    nickname: {
        type: String,           // 닉네임: 사용자가 표시할 별명
        required: true          // 필수 항목
    },
    gender: {
        type: String,           // 성별: 사용자의 성별
        enum: ['male', 'female'], // 허용 값: 남성, 여성, 기타
        default: 'other'        // 기본값은 'other'
    },
    // 추가 연락처 정보
    phone: {
        type: String,           // 전화번호: 사용자의 휴대폰 번호
        default: '',             // 기본값은 빈 문자열
        required: true
    },
    birthdate: {
        type: Date,             // 생년월일: 사용자의 생년월일 정보
        default: null,
        required: true // 기본값은 null
    },
    // coinleft: {
    //     type: Number,           // 남은 재화: 사용자가 보유한 코인 또는 재화 수량
    //     default: 0              // 기본값은 0
    // },
    // plan: {
    //     type: String,           // 플랜 구독 종류: 사용자가 가입한 구독 플랜 (예: 'free', 'premium' 등)
    //     default: 'free'         // 기본값은 'free'
    // },
    accountlink: {
        type: String,           // 연동된 계정: 소셜 로그인 등 외부 계정 정보(예: provider의 식별자)
        default: ''             // 기본값은 빈 문자열
    },
    // 소셜 로그인 정보 (추가 선택 사항)
    social: {
        provider: {
            type: String,         // 소셜 로그인 제공자 (예: 'riot', 'google', 'kakao')
            default: ''
        },
        providerId: {
            type: String,         // 제공자로부터 받은 고유 ID
            default: ''
        },
        accessToken: {
            type: String,         // 액세스 토큰 (선택 사항)
            default: ''
        }
    },
    photo: {
        type: String,           // 이미지: 프로필 사진 URL
        default: ''             // 기본값은 빈 문자열
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
    numofchat: {
        type: Number,           // 채팅 횟수: 사용자가 채팅한 총 횟수
        default: 0              // 기본값은 0
    },
    chattimer: {
        type: Date,             // 채팅 충전 타이머: 다음 채팅 이용권 충전이 가능한 시각
        default: null          // 기본값은 null (설정되지 않음)
    },

    // 매너(별점) 관련 정보
    star: {
        type: Number,           // 별점 누적: 사용자가 받은 매너 별의 누적 점수 (한 번에 1씩 증가)
        default: 0              // 기본값은 0
    },

    // 유저 등급 및 권한 정보
    userlv: {
        type: Number,           // 유저 등급: 일반 사용자(예: 1)부터 관리자(더 높은 값) 등급 구분
        default: 1              // 기본값은 1 (일반 사용자)
    },

    // // 계정 제재/정지 관련 정보 (현재 상태를 빠르게 조회하기 위한 필드들)
    // status: {
    //     type: String,           // 계정 상태: 'active'(정상), 'banned'(영구 정지), 'suspended'(일시 정지), 'warning'(경고 상태)
    //     enum: ['active', 'banned', 'suspended', 'warning'],
    //     default: 'active'       // 기본값은 'active'
    // },
    // banReason: {
    //     type: String,           // 정지/제재 사유: 관리자가 부여한 정지나 제재의 사유
    //     default: ''             // 기본값은 빈 문자열
    // },
    // banUntil: {
    //     type: Date,             // 정지 기간: 계정이 일시 정지된 경우, 정지가 해제되는 시각
    //     default: null          // 기본값은 null (영구 정지가 아니라면)
    // },
    // warningCount: {
    //     type: Number,           // 경고 횟수: 누적된 경고 횟수 (경고 한 번당 1씩 증가)
    //     default: 0              // 기본값은 0
    // },
    //
    // // 제재(정지, 경고 등) 내역을 저장할 수 있는 배열 (과거 이력을 보관)
    // sanctions: [
    //     {
    //         action: {
    //             type: String,       // 제재 종류: 'ban', 'suspend', 'warning'
    //             enum: ['ban', 'suspend', 'warning'],
    //             required: true      // 필수 항목
    //         },
    //         reason: {
    //             type: String,       // 제재 사유: 해당 제재가 부여된 이유
    //             required: true      // 필수 항목
    //         },
    //         date: {
    //             type: Date,         // 제재 일시: 제재가 부여된 날짜 및 시간
    //             default: Date.now   // 기본값은 현재 시간
    //         },
    //         duration: {
    //             type: Number,       // 제재 기간: 일시 정지 등의 경우 몇 시간 동안 적용되는지 (영구 정지인 경우 0 또는 null)
    //             default: 0
    //         }
    //     }
    // ],

    // 접속 및 활동 기록
    lastLogin: {
        type: Date,             // 마지막 로그인 시간
        default: null
    },
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
}, {
    timestamps: true           // createdAt, updatedAt 필드를 자동으로 추가하여 생성 및 수정 시각 기록
});

// User 모델을 'User' 컬렉션으로 생성 및 내보내기
module.exports = mongoose.model('User', userSchema);