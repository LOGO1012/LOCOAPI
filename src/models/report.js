import mongoose from 'mongoose';
import { User } from './UserProfile.js';

const { Schema, model } = mongoose;

// 신고 위치 정보를 한 번에 담는 서브 다큐먼트
const anchorSchema = new Schema({
    type: {                  // post | comment | reply 등
        type: String,
        enum: ['post', 'comment', 'reply', 'chat'],
        required: true
    },
    /* ▶▶ 채팅 신고 전용 필드 */
    roomId: {                  // 채팅방 ID
        type: Schema.Types.ObjectId,
        ref: 'ChatRoom',
        required: function () { return this.type === 'chat'; },
        index: true
    },
    parentId: {              // 글 ID(댓글·대댓글이라도 글 ID 유지)
        type: Schema.Types.ObjectId,
        required: true,
        index: true
    },
    targetId: {              // 실제 클릭된 객체 ID
        type: Schema.Types.ObjectId,
        required: true,
        index: true
    }
}, { _id: false });        // 하위 스키마는 _id 생성 X


// 신고 내역 스키마 정의
const reportSchema = new Schema({
    // 신고 제목
    reportTitle: {
        type: String,                   // 신고 제목: 신고 사유나 간단한 제목
        required: true                  // 필수 항목
    },
    // 신고 구역 (예: 채팅, 커뮤니티 등)
    reportArea: {
        type: String,
        enum: ['프로필', '커뮤니티'], // 신고 구역: 어느 영역에서 발생한 신고인지
        required: true
    },
    // 신고 카테고리 (예: 욕설, 정치 등)
    reportCategory: {
        type: String,                   // 신고 카테고리: 신고 내용의 분류
        enum: ['욕설, 모욕, 혐오발언', '스팸, 도배, 거짓정보', '부적절한 메세지(성인/도박/마약 등)', '규칙에 위반되는 프로필/모욕성 닉네임', '음란물 (이미지)'],
        required: true
    },
    // 신고 내용 (상세한 신고 설명)
    reportContants: {
        type: String,                   // 신고 내용: 신고에 대한 상세 설명
        required: true
    },
    // 신고한 시간
    reportDate: {
        type: Date,                     // 신고가 접수된 시각
        default: Date.now               // 기본값은 현재 시각
    },
    // 신고자 고유 ID
    reportErId: {
        type: Schema.Types.ObjectId,    // 신고자: 신고를 한 사용자의 고유 ID
        ref: 'User',                    // User 컬렉션 참조
        required: true
    },
    // 신고자 별칭 (신고 시점의 별칭 스냅샷)
    reportErNickname: {
        type: String,
        default: ''
    },
    // 답변 내용 (관리자가 신고에 대해 답변하거나 사유를 설명)
    reportAnswer: {
        type: String,
        default: ''
    },
    // 제재 내용: 계정 상태, 제재 기간 등 관리자가 내린 제재 상세 내용
    stopDetail: {
        type: String,
        enum: ['활성', '영구정지', '일시정지', '경고'],
        default: '활성'
    },
    // 제재 일시: 실제로 제재가 시작된 시간
    stopDate: {
        type: Date,
        default: null
    },
    // 정지 해제 시각: 일시 정지의 경우, 해제되는 시각
    durUntil: {
        type: Date,
        default: null
    },
    // 신고제재(관리자) 고유 ID: 신고 처리한 관리자의 ID
    adminId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    adminNickname: {
        type: String,
        default: ''
    },
    // 가해자(신고 대상) 고유 ID
    offenderId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // 가해자 별칭 (신고 시점의 가해자 별칭 스냅샷)
    offenderNickname: {
        type: String,
        default: ''
    },
    // 추가: 신고 상태 (신고가 pending, reviewed, resolved, dismissed 등)
    reportStatus: {
        type: String,
        enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
        default: 'pending'
    },
    // ▶▶ 새로 추가
    anchor: {
        type: anchorSchema,
        required: false
    },
}, {
    timestamps: true // createdAt, updatedAt 필드 자동 추가
});

// 인덱스: reportTitle, reportContants, reportErId, adminId, offenderId
reportSchema.index({ reportTitle: "text", reportContants: "text", reportErId: "text", adminId: "text", offenderId: "text" });
reportSchema.index({ reportTitle:    1 });   // 제목 필드에 B‑Tree 인덱스
reportSchema.index({ reportContants: 1 });  // 내용 필드에 B‑Tree 인덱스
reportSchema.index({ offenderNickname: 1 });
reportSchema.index({ adminNickname: 1 });

// Report 모델을 'Report' 컬렉션으로 생성 및 내보내기
export const Report = model('Report', reportSchema);
