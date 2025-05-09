// src/models/chatRoomHistory.js
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const chatRoomHistorySchema = new Schema({
    // 1) 참조용: 원본 ChatRoom ID
    chatRoomId: {
        type: Schema.Types.ObjectId,
        ref: 'ChatRoom',
        required: true
    },


    // 3) 이벤트 발생 시각
    timestamp: {
        type: Date,
        default: Date.now,
        required: true
    },

    // 4) 방 메타 스냅샷: 필요에 따라 아래 항목들을 남겨두면,
    //    과거 방 정보를 그대로 재구성하거나 필터링하기 편합니다.
    meta: {
        chatUsers:    [{ type: Schema.Types.ObjectId, ref: 'User' }],
        roomType:     String,
        capacity:     Number,
        matchedGender:String,
        ageGroup:     String,
        createdAt:    Date
    }
}, {  timestamps: false });

export const ChatRoomHistory = model('ChatRoomHistory', chatRoomHistorySchema);
