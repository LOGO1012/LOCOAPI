import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * 채팅 횟수 보상 행위 기록 (마스터)
 */
const ChatRewardLogSchema = new Schema({
    // 보상을 준 관리자
    adminId: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    
    // 지급 내용
    rewardAmount: { 
        type: Number, 
        required: true 
    },
    reason: String,
    
    // 대상자 수 (요약 정보)
    targetCount: {
        type: Number,
        default: 0
    },
    
    // 접근 환경 정보
    ipAddress: String,
    userAgent: String
    
}, { 
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'chatRewardLogs'
});

ChatRewardLogSchema.index({ adminId: 1, createdAt: -1 });

export default mongoose.model('ChatRewardLog', ChatRewardLogSchema);
