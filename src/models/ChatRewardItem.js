import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * 개별 사용자 보상 수령 및 취소 정보 스키마
 */
const ChatRewardItemSchema = new Schema({
    // 어떤 보상 행위에 속하는지 (마스터 참조)
    rewardLogId: {
        type: Schema.Types.ObjectId,
        ref: 'ChatRewardLog',
        required: true,
        index: true
    },
    
    // 보상을 받은 사용자
    targetUserId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // 개별 상태
    status: {
        type: String,
        enum: ['active', 'cancelled'],
        default: 'active',
        index: true
    },
    
    // 취소 정보
    cancelledAt: Date,
    cancelledBy: { 
        type: Schema.Types.ObjectId, 
        ref: 'User' 
    },
    cancelReason: String
    
}, { 
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'chatRewardItems'
});

export default mongoose.model('ChatRewardItem', ChatRewardItemSchema);
