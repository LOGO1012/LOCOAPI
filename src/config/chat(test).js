import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * Conversation 스키마
 * - 랜덤채팅의 경우, 채팅방은 임시로 생성되고 금방 소멸할 수 있으므로,
 *   필요한 최소한의 정보만 담습니다.
 */
const conversationSchema = new Schema({
    participants: [
        {
            type: Schema.Types.ObjectId,   // 참여자의 User ID (참조)
            ref: 'User',
            required: true
        }
    ],
    capacity: {
        type: Number,                   // 채팅방 정원 (예: 2명, 3명, 4명, 5명)
        required: true
    },
    isActive: {
        type: Boolean,                  // 채팅방 활성화 여부: 참가 인원이 정원에 도달하면 true
        default: false
    },
    createdAt: {
        type: Date,                     // 채팅방 생성 시각
        default: Date.now,
        index: true                     // 생성 시각 인덱스 (TTL 인덱스와 함께 사용 가능)
    }
}, {
    // 이 스키마는 간단한 채팅방 정보만을 저장합니다.
    timestamps: true                  // 자동으로 createdAt, updatedAt 생성 (필요 시)
});

/**
 * Message 스키마
 * - 각 메시지는 어느 채팅방(conversation)에 속하는지와 메시지 작성자, 내용, 전송 시각 등을 저장합니다.
 */
const messageSchema = new Schema({
    conversation: {
        type: Schema.Types.ObjectId,   // 이 메시지가 속한 채팅방의 ID
        ref: 'Conversation',
        required: true
    },
    sender: {
        type: Schema.Types.ObjectId,   // 메시지를 보낸 사람의 User ID
        ref: 'User',
        required: true
    },
    text: {
        type: String,                  // 메시지 내용
        required: true
    },
    createdAt: {
        type: Date,                    // 메시지 전송 시각
        default: Date.now,
        index: true                   // 생성 시각 인덱스 (TTL 인덱스 설정 가능)
    }
}, {
    timestamps: false                // Message 스키마에서는 createdAt만 사용 (필요 시 timestamps 옵션 활용 가능)
});

// 필요한 경우, TTL 인덱스를 설정하여 일정 시간이 지난 채팅방이나 메시지를 자동 삭제할 수 있습니다.
// 예를 들어, 24시간 후 자동 삭제하는 TTL 인덱스 설정 (초 단위):
// conversationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
// messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

// 모델 생성 및 내보내기
module.exports = {
    Conversation: mongoose.model('Conversation', conversationSchema),
    Message: mongoose.model('Message', messageSchema)
};
