// src/models/chatNotification.js
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const chatNotificationSchema = new Schema({
    recipient: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    chatRoom: {
        type: Schema.Types.ObjectId,
        ref: 'ChatRoom',
        required: true
    },
    sender: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    roomType: {
        type: String,
        enum: ['friend', 'random'],
        required: true
    },
    message: {
        type: String,
        required: true
    },
    isRead: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

export const ChatNotification = model('ChatNotification', chatNotificationSchema);
