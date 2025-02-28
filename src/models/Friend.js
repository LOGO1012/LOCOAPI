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
        default: nuil
    },
    friendCreatedAt: {
        type: Date,
        default: new Date(),
    }
},{timestamps: true});

export const Friend = mongoose.model('Friend', friendSchema);