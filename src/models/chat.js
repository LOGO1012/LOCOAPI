import mongoose from 'mongoose';
const { Schema, model } = mongoose;
import { User }from './UserProfile.js';

/**
 * ChatRoom 스키마
 * - 채팅방 이용자(chatUsers): 채팅방에 참여하는 사용자들의 ID 배열 (User 컬렉션 참조)
 * - capacity: 랜덤 채팅방의 경우, 클라이언트에서 선택한 채팅방 정원 (예: 2, 3, 4, 5명)
 * - isActive: 채팅방 활성 유무 (랜덤 채팅방은 정원에 도달하면 true로 전환)
 * - roomType: 채팅 종류 ('friend'는 친구 채팅, 'random'은 랜덤 채팅)
 * - ageGroup: 성인/미성년자 구분 필드
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
        required: function() { return this.roomType === 'random'; }
    },
    isActive: {
        type: Boolean,
        default: false
    },
    roomType: {
        type: String,
        enum: ['friend', 'random'],
        required: true
    },
    gameType: {
        type: String,
        enum: ['lol', 'sudden']
    },
    matchedGender: {
        type: String,
        enum: ['opposite', 'any', 'same'],
        default: 'any'
    },
    status: {
        type: String,
        enum: ['waiting', 'active'],
        default: 'waiting'
    },
    // 성인과 미성년자 채팅방 구분을 위한 필드
    ageGroup: {
        type: String,
        enum: ['adult', 'minor'],
        required: function() { return this.roomType === 'random'; }
    },
    // 사용자별 성별 선택 정보 (Map 구조로 효율적 저장)
    genderSelections: {
        type: Map,
        of: String,  // userId -> selectedGender (opposite/any/same)
        default: new Map()
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

/**
 * ChatMessage 스키마 - 암호화 지원
 * 기존 필드와 새로운 암호화 필드들을 모두 포함
 */
const chatMessageSchema = new Schema({
    chatRoom: {
        type: Schema.Types.ObjectId,
        ref: 'ChatRoom',
        required: true
    },
    sender: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required() { return !this.isSystem; }
    },
    
    // 기존 평문 필드 (조건부 필수)
    text: {
        type: String,
        required: function() { return !this.isEncrypted; }, // 암호화 안된 경우만 필수
        maxlength: 100
    },
    
    // === 암호화 필드들 ===
    encryptedText: {
        type: String                  // AES-256-GCM 암호화된 메시지
    },
    iv: {
        type: String                  // 초기화 벡터 (Initialization Vector)
    },
    tag: {
        type: String                  // 인증 태그 (Authentication Tag)
    },
    isEncrypted: {
        type: Boolean,
        default: false                // 암호화 여부
    },
    
    // === 검색용 필드들 ===
    keywords: [{
        type: String,                 // 해시된 키워드들 (SHA-256)
        index: true                   // 검색 성능을 위한 인덱스
    }],
    messageHash: {
        type: String,                 // 메시지 전체 해시 (중복 검출용)
        index: true
    },
    
    // === 신고 관련 필드들 ===
    isReported: {
        type: Boolean,
        default: false,
        index: true                   // 신고된 메시지 빠른 조회
    },
    reportedAt: {
        type: Date,
        index: true
    },
    reportedBy: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    
    // === 기존 필드들 유지 ===
    textTime: {
        type: Date,
        default: Date.now
    },
    readBy: [{
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        readAt: {
            type: Date,
            default: Date.now
        }
    }],
    isDeleted: {
        type: Boolean,
        default: false
    },
    isSystem: { 
        type: Boolean, 
        default: false 
    },
    
    // === 메타데이터 (선택적) ===
    metadata: {
        platform: String,            // 'web', 'mobile' 등
        userAgent: String,            // 클라이언트 정보
        ipHash: String                // IP 해시 (개인정보보호)
    }
    
}, { timestamps: true });

// === 인덱스 설정 ===
// 기존 인덱스
chatMessageSchema.index({ chatRoom: "text", sender: "text", text: "text" });
chatMessageSchema.index({ chatRoom: 1, textTime: -1 });
chatMessageSchema.index({ 'readBy.user': 1 });

// 새로운 암호화 관련 인덱스
chatMessageSchema.index({ keywords: 1, createdAt: -1 });        // 키워드 검색용
chatMessageSchema.index({ isReported: 1, reportedAt: -1 });     // 신고 메시지 조회용
chatMessageSchema.index({ messageHash: 1 });                    // 중복 검출용
chatMessageSchema.index({ isEncrypted: 1, createdAt: -1 });     // 암호화 메시지 분류용

// === Virtual 필드 ===
// 실제 표시용 텍스트 (암호화 상태에 따라)
chatMessageSchema.virtual('displayText').get(function() {
    if (this.isEncrypted) {
        return '[암호화된 메시지]';     // 일반 사용자에게는 숨김
    } else {
        return this.text || '';         // 기존 평문 메시지
    }
});

// 메시지 길이 (통계용)
chatMessageSchema.virtual('textLength').get(function() {
    if (this.isEncrypted && this.encryptedText) {
        return this.encryptedText.length; // 암호화된 데이터 길이
    } else {
        return (this.text || '').length;  // 평문 데이터 길이
    }
});

// JSON 출력에 virtual 필드 포함
chatMessageSchema.set('toJSON', { virtuals: true });
chatMessageSchema.set('toObject', { virtuals: true });

/**
 * RoomEntry 스키마 - 채팅방 입장 시간 기록
 */
const roomEntrySchema = new Schema({
    room: {
        type: Schema.Types.ObjectId,
        ref: 'ChatRoom',
        required: true
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    entryTime: {
        type: Date,
        default: Date.now
    },
    lastActiveTime: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// 인덱스 추가
roomEntrySchema.index({ room: 1, user: 1 }, { unique: true });
roomEntrySchema.index({ entryTime: -1 });

/**
 * ChatRoomExit 스키마 - 채팅방 퇴장 기록
 */
const chatRoomExitSchema = new Schema({
    chatRoom: {
        type: Schema.Types.ObjectId,
        ref: 'ChatRoom',
        required: true
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    leftAt: {
        type: Date,
        default: Date.now
    },
    phase: {
        type: String,
        enum: ['waiting', 'active'],
        required: true
    }
}, { timestamps: true });

// 모델 Export
export const RoomEntry = model('RoomEntry', roomEntrySchema);
export const ChatRoomExit = model('ChatRoomExit', chatRoomExitSchema);
export const ChatRoom = model('ChatRoom', chatRoomSchema);
export const ChatMessage = model('ChatMessage', chatMessageSchema);
