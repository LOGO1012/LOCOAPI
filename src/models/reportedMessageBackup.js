// src/models/reportedMessageBackup.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * 신고된 메시지 백업 스키마 (법적 대응용)
 * 개인정보보호법 준수: 신고된 메시지는 3년간 보관
 */
const ReportedMessageBackupSchema = new Schema({
    originalMessageId: { 
        type: Schema.Types.ObjectId, 
        ref: 'ChatMessage', 
        required: true,
        unique: true 
    },
    plaintextContent: { 
        type: String, 
        required: true 
    }, // 법적 대응용 평문 백업
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
        default: 'legal_compliance' 
    },
    
    // 접근 로그 (관리자 복호화 시 기록)
    accessLog: [{
        accessedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        accessTime: { type: Date, default: Date.now },
        purpose: String,
        ipAddress: String,
        userAgent: String
    }],
    
    createdAt: { type: Date, default: Date.now },
    retentionUntil: { type: Date } // 보관 기한 (3년)
}, { 
    timestamps: true,
    collection: 'reportedMessageBackups'
});

// 인덱스 설정
ReportedMessageBackupSchema.index({ originalMessageId: 1 }, { unique: true });
ReportedMessageBackupSchema.index({ reportedBy: 1, createdAt: -1 });
ReportedMessageBackupSchema.index({ retentionUntil: 1 }); // TTL 인덱스용

// TTL 인덱스로 자동 삭제 (3년 후)
ReportedMessageBackupSchema.index({ createdAt: 1 }, { 
    expireAfterSeconds: 3 * 365 * 24 * 60 * 60 // 3년
});

export default mongoose.model('ReportedMessageBackup', ReportedMessageBackupSchema);
