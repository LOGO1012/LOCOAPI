// models/FriendRequest.js
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const friendRequestSchema = new Schema({
    sender: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    receiver: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined'],
        default: 'pending',
    },
}, { timestamps: { createdAt: true, updatedAt: false } });

// ✅ 복합 인덱스 추가
friendRequestSchema.index({ sender: 1, receiver: 1, status: 1 });

export const FriendRequest = model('FriendRequest', friendRequestSchema);
