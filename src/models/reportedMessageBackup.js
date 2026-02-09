// src/models/reportedMessageBackup.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * 신고된 메시지 백업 스키마 (법적 대응용)
 * 개인정보보호법 준수: 신고된 메시지는 3년간 보관 (암호화 상태 유지)
 *
 * 변경 사항:
 * - plaintextContent 제거 → 암호화 필드(encryptedText, iv, tag)로 변경
 * - 컨텍스트 메시지 지원 필드 추가 (messageType, relatedReportId, reportedMessageId, contextOrder)
 */
const ReportedMessageBackupSchema = new Schema({
    // === 원본 메시지 참조 ===
    originalMessageId: {
        type: Schema.Types.ObjectId,
        ref: 'ChatMessage',
        required: true
        // unique 제거: 동일 메시지가 여러 신고의 컨텍스트로 저장될 수 있음
    },

    // === 비정규화 필드 (쿼리 최적화) ===
    roomId: {
        type: Schema.Types.ObjectId,
        ref: 'ChatRoom',
        index: true
    },
    sender: {
        _id: { type: Schema.Types.ObjectId, ref: 'User' },
        nickname: String
    },
    messageCreatedAt: {
        type: Date
    },

    // === 암호화 필드 (개인정보보호법 준수) ===
    encryptedText: {
        type: String,
        required: function() { return this.isEncrypted; }
    },
    iv: {
        type: String,
        required: function() { return this.isEncrypted; }
    },
    tag: {
        type: String,
        required: function() { return this.isEncrypted; }
    },
    isEncrypted: {
        type: Boolean,
        default: true
    },
    // 평문 메시지용 (암호화되지 않은 경우)
    text: {
        type: String,
        required: function() { return !this.isEncrypted; }
    },

    // === 컨텍스트 메시지 관련 필드 ===
    messageType: {
        type: String,
        enum: ['reported', 'context_before', 'context_after'],
        default: 'reported',
        index: true
    },
    relatedReportId: {
        type: Schema.Types.ObjectId,
        ref: 'Report',
        index: true
    },
    reportedMessageId: {
        type: Schema.Types.ObjectId,
        ref: 'ChatMessage',
        index: true
    },
    contextOrder: {
        type: Number,
        default: 0  // 신고 메시지=0, 이전=음수(-50~-1), 이후=양수(+1~+50)
    },

    // === 신고 관련 필드 ===
    reportedBy: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    reportReason: {
        type: String,
        enum: ['inappropriate', 'spam', 'harassment', 'other'],
        default: 'other'
    },
    backupReason: {
        type: String,
        enum: ['legal_compliance', 'context_preservation'],
        default: 'legal_compliance'
    },

    // === 접근 로그 (관리자 조회 시 기록) ===
    accessLog: [{
        accessedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        accessTime: { type: Date, default: Date.now },
        purpose: String,
        ipAddress: String,
        userAgent: String
    }],

    // === 시간 필드 ===
    retentionUntil: { type: Date }  // 보관 기한 (3년)
}, {
    timestamps: { createdAt: true, updatedAt: false },  // createdAt만 생성 (백업 데이터는 수정 안함)
    collection: 'reportedMessageBackups'
});

// === 인덱스 설정 ===

// 원본 메시지 + 신고된 메시지 복합 인덱스 (중복 방지용)
ReportedMessageBackupSchema.index(
    { originalMessageId: 1, reportedMessageId: 1 },
    {
        unique: true,
        sparse: true,
        name: 'idx_original_reported_unique'
    }
);

// 신고된 메시지의 컨텍스트 조회용
ReportedMessageBackupSchema.index(
    { reportedMessageId: 1, messageType: 1, contextOrder: 1 },
    { name: 'idx_context_lookup' }
);

// 신고 ID로 관련 메시지 조회용
ReportedMessageBackupSchema.index(
    { relatedReportId: 1, contextOrder: 1 },
    { name: 'idx_report_context' }
);

// 채팅방별 백업 메시지 조회용
ReportedMessageBackupSchema.index({ roomId: 1, messageCreatedAt: 1 });

// 신고자 + 생성일 인덱스
ReportedMessageBackupSchema.index({ reportedBy: 1, createdAt: -1 });

// TTL 인덱스용
ReportedMessageBackupSchema.index({ retentionUntil: 1 });

// TTL 인덱스로 자동 삭제 (3년 후)
ReportedMessageBackupSchema.index(
    { createdAt: 1 },
    {
        expireAfterSeconds: 3 * 365 * 24 * 60 * 60,  // 3년
        name: 'idx_ttl_3years'
    }
);

export default mongoose.model('ReportedMessageBackup', ReportedMessageBackupSchema);
