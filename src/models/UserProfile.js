
//PASS 받아오는거 어디넣을지
import mongoose from "mongoose"; // mongoose 모듈 불러오기
const { Schema, model } = mongoose; // Schema 생성자 추출

// User 스키마 정의
const userSchema = new Schema({
    // 기본 프로필 정보
    name: {
        type: String,           // 이름: 사용자의 전체 이름
        required: true          // 필수 항목
    },
    nickname: {
        type: String,           // 닉네임: 사용자가 표시할 별명
        required: true,         // 필수 항목
        unique: true,           // 닉네임 유니크 설정(중복제거)
        trim: true               // 공백 제거
    },
    gender: {
        type: String,           // 성별: 사용자의 성별
        enum: ['male', 'female'], // 허용 값: 남성, 여성, 기타
        default: ''
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
    coinleft: {
        type: Number,           // 남은 재화: 사용자가 보유한 코인 또는 재화 수량
        default: 0              // 기본값은 0
    },
    accountlink: {
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
        provider: {
            type: String,         // 소셜 로그인 제공자 (예: 'riot', 'google', 'kakao')
            default: ''
        },
        providerId: {
            type: String,         // 제공자로부터 받은 고유 ID
            default: ''
        },
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
        enum: [1, 2, 3],        // 1 = 유저 , 2 = 관리자, 3 = 우리(개발자)
        default: 1              // 기본값은 1 (일반 사용자)
    },
    // 접속 및 활동 기록
    lastLogin: {
        type: Date,             // 마지막 로그인 시간
        default: null
    },
    // 신고 누적 횟수
    numofreport: {
        type: Number,
        default: 0
    }
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
export const User = mongoose.model('User', userSchema);