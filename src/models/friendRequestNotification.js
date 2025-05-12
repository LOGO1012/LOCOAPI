// src/models/friendRequestNotification.js
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const friendReqSchema = new Schema({
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sender:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message:   { type: String, required: true },
    isRead:    { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

export const FriendRequestNotification = model('FriendRequestNotification', friendReqSchema);
