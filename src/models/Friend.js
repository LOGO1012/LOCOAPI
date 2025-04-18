import mongoose from 'mongoose'
import { User }from './UserProfile.js';

const { Schema, model } = mongoose;

const friendSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    friendId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    friendStatus: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
    },
    friendAcceptedAt: {
        type: Date,
        default: null
    },
    friendCreatedAt: {
        type: Date,
        default: new Date(),
    }
},{timestamps: true});


// 인덱스: friendStatus (필요한 경우 다른 필드도 추가 가능)
friendSchema.index({ friendStatus: "text" });


export const Friend = model('Friend', friendSchema);