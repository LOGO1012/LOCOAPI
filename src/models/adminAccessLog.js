// src/models/adminAccessLog.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * 관리자 접근 로그 스키마
 * 정보통신망법 제28조 준수: 접속기록 보관 의무
 */
const AdminAccessLogSchema = new Schema({
    // 접근한 관리자 정보
    adminId: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    adminNickname: String, // 로그 시점의 닉네임 기록
    adminLevel: Number,    // 접근 시점의 권한 레벨 (userLv)
    
    // 수행한 작업
    action: {
        type: String,
        enum: [
            'message_decryption',    // 메시지 복호화
            'user_data_access',      // 사용자 정보 조회
            'search_operation',      // 메시지 검색
            'context_investigation', // 신고 맥락 조회
            'report_review',         // 신고 검토
            'admin_panel_access',    // 관리자 패널 접근
            'user_data_modification', // 사용자 정보 수정
            'user_statistics_access', // 사용자 통계 조회
            'report_management',      // 신고 관리
            'user_block_management'   // 사용자 차단 관리
        ],
        required: true
    },
    
    // 대상 정보
    targetType: {
        type: String,
        enum: ['ChatMessage', 'User', 'Report', 'ChatRoom', 'Statistics'],
        required: true
    },
    targetId: {
        type: Schema.Types.ObjectId,
        required: false
    },
    
    // 작업 목적
    purpose: {
        type: String,
        enum: [
            'report_investigation',   // 신고 조사
            'user_support',          // 고객 지원
            'system_maintenance',    // 시스템 관리
            'legal_compliance',      // 법적 대응
            'security_review',       // 보안 검토
            'data_verification',     // 데이터 검증
            'admin_management'       // 관리자 업무
        ],
        required: true
    },
    
    // 접근 환경 정보
    ipAddress: String,
    userAgent: String,
    sessionId: String,
    
    // 작업 결과
    success: { type: Boolean, default: true },
    errorMessage: String,
    
    // 추가 메타데이터
    metadata: {
        searchKeyword: String,    // 검색 시 사용한 키워드
        decryptedFields: [String], // 복호화한 필드 목록
        contextRange: String,     // 조회한 맥락 범위
        exportedData: Boolean     // 데이터 내보내기 여부
    },
    
    timestamp: { type: Date, default: Date.now }
}, { 
    timestamps: true,
    collection: 'adminAccessLogs'
});

// 인덱스 설정
AdminAccessLogSchema.index({ adminId: 1, timestamp: -1 });
AdminAccessLogSchema.index({ action: 1, timestamp: -1 });
AdminAccessLogSchema.index({ targetType: 1, targetId: 1, timestamp: -1 });
AdminAccessLogSchema.index({ purpose: 1, timestamp: -1 });

// TTL 인덱스 (5년 후 자동 삭제)
AdminAccessLogSchema.index({ timestamp: 1 }, { 
    expireAfterSeconds: 5 * 365 * 24 * 60 * 60 // 5년
});

// Static 메서드: 접근 로그 생성 헬퍼
AdminAccessLogSchema.statics.logAccess = async function(logData) {
    try {
        const log = new this(logData);
        await log.save();
        console.log(`📝 관리자 접근 로그 기록: ${logData.action} by ${logData.adminId}`);
        return log;
    } catch (error) {
        console.error('❌ 관리자 접근 로그 기록 실패:', error);
        throw error;
    }
};

// Static 메서드: 관리자별 접근 이력 조회
AdminAccessLogSchema.statics.getAdminHistory = async function(adminId, days = 30) {
    const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
    
    return await this.find({
        adminId: adminId,
        timestamp: { $gte: startDate }
    })
    .sort({ timestamp: -1 })
    .limit(100)
    .lean();
};

export default mongoose.model('AdminAccessLog', AdminAccessLogSchema);
