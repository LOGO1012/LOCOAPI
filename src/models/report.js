import mongoose from 'mongoose'; // mongoose 모듈 불러오기
const { Schema } = mongoose;         // Schema 생성자 추출

// 신고 내역 스키마 정의
const reportSchema = new Schema({
    // 신고 제목
    reporttitle: {
        type: String,                   // 신고 제목: 신고 사유나 간단한 제목
        required: true                  // 필수 항목
    },
    // 신고 구역 (예: 채팅, 커뮤니티 등)
    reportArea: {
        type: String,
        enum: ['Friend Chat', 'RandomChat', 'community'],// 신고 구역: 어느 영역에서 발생한 신고인지
        required: true
    },
    // 신고 카테고리 (예: 욕설, 정치 등)
    reportcategory: {
        type: String,                   // 신고 카테고리: 신고 내용의 분류
        enum: ['욕설, 모욕, 혐오발언', '스팸, 도배, 거짓정보', '부적절한 메세지(성인/도박/마약 등)','규칙에 위반되는 프로필/모욕성 닉네임'],
        required: true
    },
    // 신고 내용 (상세한 신고 설명)
    reportcontants: {
        type: String,                   // 신고 내용: 신고에 대한 상세 설명
        required: true
    },
    // 신고한 시간
    reportdate: {
        type: Date,                     // 신고가 접수된 시각
        default: Date.now               // 기본값은 현재 시각
    },
    // 신고자 고유 ID
    reporterId: {
        type: Schema.Types.ObjectId,    // 신고자: 신고를 한 사용자의 고유 ID
        ref: 'User',                    // User 컬렉션 참조
        required: true
    },
    // 답변 내용 (관리자가 신고에 대해 답변하거나 사유를 설명)
    reportanswer: {
        type: String,                   // 관리자의 답변 내용
        default: ''                     // 기본값은 빈 문자열
    },
    // 제재 내용: 계정 상태, 제재 기간 등 관리자가 내린 제재 상세 내용
    stopdetail: {
        type: String,           // 계정 상태: 'active'(정상), 'banned'(영구 정지), 'suspended'(일시 정지), 'warning'(경고 상태)
        enum: ['active', 'banned', 'suspended', 'warning'],
        default: 'active'       // 기본값은 'active'                    // 기본값은 빈 문자열
    },
    // 제재 일시: 실제로 제재가 시작된 시간
    stopdate: {
        type: Date,                     // 제재가 부여된 시각
        default: null                   // 기본값은 null (미부여시)
    },
    // 정지 해제 시각: 일시 정지의 경우, 해제되는 시각
    durUntil: {
        type: Date,                     // 정지 해제 시각
        default: null
    },
    // 신고제재(관리자) 고유 ID: 신고 처리한 관리자의 ID
    adminId: {
        type: Schema.Types.ObjectId,    // 신고 처리 관리자
        ref: 'User',                    // User 컬렉션 참조
        default: null                  // 기본값은 null (아직 처리되지 않은 경우)
    },
    // 가해자(신고 대상) 고유 ID
    offenderId: {
        type: Schema.Types.ObjectId,    // 신고 대상, 즉 가해자의 ID
        ref: 'User',
        required: true
    },
    // 추가: 신고 상태 (신고가 pending 처리중, reviewed 검토됨, resolved 해결됨, dismissed 기각 등)
    reportStatus: {
        type: String,
        enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
        default: 'pending'
    }
}, {
    timestamps: true                  // createdAt, updatedAt 필드 자동 추가
});

// Report 모델을 'Report' 컬렉션으로 생성 및 내보내기
module.exports = mongoose.model('Report', reportSchema);
