import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/**ll
 * ChatRoom 스키마
 * - 채팅방 이용자(chatUsers): 채팅방에 참여하는 사용자들의 ID 배열 (User 컬렉션 참조)
 * - capacity: 랜덤 채팅방의 경우, 클라이언트에서 선택한 채팅방 정원 (예: 2, 3, 4, 5명)
 *   - 친구 채팅방의 경우에는 이 필드가 필요 없을 수 있음
 * - isActive: 채팅방 활성 유무 (랜덤 채팅방은 정원에 도달하면 true로 전환)
 * - roomType: 채팅 종류 ('friend'는 친구 채팅, 'random'은 랜덤 채팅)
 * - createdAt: 채팅방 생성 시각 (timestamps 옵션으로도 관리 가능)
 */
const chatRoomSchema = new Schema({
    chatUsers: [
        {
            type: Schema.Types.ObjectId,   // 참여하는 사용자의 고유 ID
            ref: 'User',
            required: true
        }
    ],
    capacity: {
        type: Number,
        // 랜덤 채팅방인 경우에만 필수로 사용할 수 있습니다.
        // 채팅방 정원 (예: 2명, 3명, 4명, 5명)
        required: function() { return this.roomType === 'random'; }
    },
    isActive: {
        type: Boolean,
        default: false                 // 기본적으로 채팅방은 비활성 상태이며, 정원에 도달하면 true로 변경
    },
    roomType: {
        type: String,
        enum: ['friend', 'random'],    // 채팅 종류: 'friend'(친구 채팅), 'random'(랜덤 채팅)
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now              // 채팅방 생성 시각
    }
}, { timestamps: true });          // createdAt, updatedAt 필드를 자동 생성

/**
 * ChatMessage 스키마
 * - chatRoom: 메시지가 속한 채팅방의 ID (ChatRoom 컬렉션 참조)
 * - sender: 메시지를 보낸 사람의 ID (User 컬렉션 참조)
 * - text: 메시지 내용
 * - textTime: 메시지 전송 시각 (추가로 저장할 필요가 있으면 사용)
 * - timestamps 옵션을 통해 생성 및 수정 시각을 자동 관리합니다.
 */
const chatMessageSchema = new Schema({
    chatRoom: {
        type: Schema.Types.ObjectId,
        ref: 'ChatRoom',              // 메시지가 속한 채팅방
        required: true
    },
    sender: {
        type: Schema.Types.ObjectId,
        ref: 'User',                  // 메시지를 보낸 사용자의 고유 ID
        required: true
    },
    text: {
        type: String,                 // 메시지 내용
        required: true
    },
    textTime: {
        type: Date,
        default: Date.now             // 메시지 전송 시각을 별도로 기록 (timestamps 외에 추가 정보로 활용 가능)
        //index: true                   // 생성 시각 인덱스 (TTL 인덱스 설정 가능)
    }
}, { timestamps: true });          // createdAt, updatedAt 필드를 자동 생성

export const ChatRoom = model('ChatRoom', chatRoomSchema);
export const ChatMessage = model('ChatMessage', chatMessageSchema);