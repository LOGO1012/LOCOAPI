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
}, {
    timestamps: true,
});

export const FriendRequest = model('FriendRequest', friendRequestSchema);
