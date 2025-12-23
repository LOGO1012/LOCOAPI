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
        of: {
            gender: {
                type: String,
                enum: ['male', 'female'],
                required: true
            },
            preference: {
                type: String,
                enum: ['opposite', 'same', 'any'],
                required: true
            }
        },
        default: new Map()
    },
    friendPairId: {
        type: String,
        sparse: true,      // friend 방만 값을 가짐 (random 방은 null)
        unique: true,      // 중복 방지 (핵심!)
        index: true        // 조회 성능 향상
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pre-save Hook
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
chatRoomSchema.pre('save', function(next) {
    // 친구방이고 참가자가 2명일 때만
    if (this.roomType === 'friend' && this.chatUsers.length === 2) {
        // 1. chatUsers를 문자열로 변환
        // 2. 알파벳순 정렬 (항상 같은 순서 보장)
        // 3. 언더스코어로 연결
        const sortedIds = this.chatUsers
            .map(id => id.toString())
            .sort();
        this.friendPairId = sortedIds.join('_');
        console.log(`[Pre-save] friendPairId 생성: ${this.friendPairId}`);
    }
    next();
});

// 1. friendPairId unique 인덱스 (가장 중요!)
chatRoomSchema.index(
    { friendPairId: 1 },
    {
        unique: true,  // 중복 방지
        sparse: true   // friend 방만 (random 방은 null)
    }
);

// 2. 친구방 조회 최적화 인덱스
chatRoomSchema.index({
    roomType: 1,
    chatUsers: 1,
    isActive: 1
}, {
    name: 'friend_room_active_lookup',
    partialFilterExpression: { roomType: 'friend' }
});

// ✅ 3. chatUsers 단독 인덱스 (기존 코드와 호환성)
chatRoomSchema.index({ roomType: 1, chatUsers: 1 }); // 복합 인덱스 추가
chatRoomSchema.index({ chatUsers: 1 });

// 4. 방 타입별 조회 최적화 (getAllChatRooms 필터링)
chatRoomSchema.index(
    { roomType: 1, isActive: 1 },
    {
        name: 'idx_roomType_isActive',
        background: true  // ✅ 서비스 중단 없이 생성
    }
);

// 5. 최신 방 정렬 최적화 (createdAt 정렬 시 사용)
chatRoomSchema.index(
    { createdAt: -1 },  // -1 = 내림차순
    {
        name: 'idx_createdAt_desc',
        background: true
    }
);

// 6. 기본 매칭 최적화 인덱스 (모든 매칭에 사용)
chatRoomSchema.index(
    {
        roomType: 1,      // 'random' 필터링
        status: 1,        // 'waiting' 필터링
        isActive: 1,      // false 필터링
        createdAt: 1      // 오래된 방부터 정렬 (ascending)
    },
    {
        name: 'idx_matching_optimization',
        background: true,
        partialFilterExpression: {
            roomType: 'random',  // random 방에만 인덱스 적용 (효율성)
            status: 'waiting',
            isActive: false
        }
    }
);

// 7. 성별 매칭 최적화 인덱스 (성별 조건이 있는 매칭에 사용)
chatRoomSchema.index(
    {
        roomType: 1,
        status: 1,
        matchedGender: 1,  // 성별 조건 필터링
        isActive: 1,
        createdAt: 1
    },
    {
        name: 'idx_gender_matching_optimization',
        background: true,
        partialFilterExpression: {
            roomType: 'random',
            status: 'waiting',
            isActive: false
        }
    }
);

// 8. ageGroup 매칭 최적화 인덱스 (나이 조건 포함)
chatRoomSchema.index(
    {
        roomType: 1,
        status: 1,
        ageGroup: 1,      // 성인/미성년자 필터링
        isActive: 1,
        createdAt: 1
    },
    {
        name: 'idx_age_matching_optimization',
        background: true,
        partialFilterExpression: {
            roomType: 'random',
            status: 'waiting',
            isActive: false
        }
    }
);


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
//chatMessageSchema.index({ chatRoom: "text", sender: "text", text: "text" });
chatMessageSchema.index({ chatRoom: 1, textTime: -1 });
chatMessageSchema.index({ 'readBy.user': 1 });

// 읽음 처리 최적화 복합 인덱스
chatMessageSchema.index(
    {
        chatRoom: 1,
        sender: 1,
        'readBy.user': 1
    },
    {
        name: 'idx_mark_as_read',
        background: true  // 무중단 생성
    }
);

// 🆕 안읽은 개수 조회 최적화 인덱스 (배치 API용)
chatMessageSchema.index(
    {
        chatRoom: 1,
        'readBy.user': 1,
        sender: 1
    },
    {
        name: 'idx_unread_optimization',
        background: true
    }
);

// 새로운 암호화 관련 인덱스
chatMessageSchema.index({ isReported: 1, reportedAt: -1 });     // 신고 메시지 조회용
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

// 1. 사용자별 퇴장 목록 조회 (핵심 인덱스!)
// 사용처: getAllChatRooms에서 매번 호출
chatRoomExitSchema.index(
    { user: 1 },
    {
        name: 'idx_user',
        background: true
    }
);

// 2. 방+사용자 퇴장 기록 조회
// 사용처: leaveChatRoomService에서 중복 퇴장 방지
chatRoomExitSchema.index(
    { chatRoom: 1, user: 1 },
    {
        name: 'idx_chatRoom_user',
        background: true
    }
);


// ✅ 새로 추가할 인덱스
chatRoomExitSchema.index(
    { chatRoom: 1, phase: 1 },
    { name: 'idx_chatRoom_phase', background: true }
);

// 모델 Export
export const RoomEntry = model('RoomEntry', roomEntrySchema);
export const ChatRoomExit = model('ChatRoomExit', chatRoomExitSchema);
export const ChatRoom = model('ChatRoom', chatRoomSchema);
export const ChatMessage = model('ChatMessage', chatMessageSchema);
