// src/models/Poll.js

import mongoose from 'mongoose';

const { Schema } = mongoose;

// 투표 옵션 스키마
const pollOptionSchema = new Schema({
    text: {
        type: String,
        required: true,
        maxlength: 50
    },
    votes: {
        type: Number,
        default: 0
    },
    votedUsers: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }]
});

// 투표 스키마
export const pollSchema = new Schema({
    question: {
        type: String,
        required: true,
        maxlength: 100
    },
    options: [pollOptionSchema],
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    totalVotes: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });
