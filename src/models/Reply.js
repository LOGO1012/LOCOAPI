// src/models/Reply.js

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const replySchema = new Schema({
    commentId: {
        type: Schema.Types.ObjectId,
        ref: 'Comment',
        required: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    commentContents: {
        type: String,
        required: true,
    },
    replyImage: {
        type: String,
        default: null,
    },
    isAnonymous: {
        type: Boolean,
        default: false,
    },
    anonymousNickname: {
        type: String,
        default: null,
    },
    ip: {
        type: String,
        default: null
    },
    userAgent: {
        type: String,
        default: null
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
}, { timestamps: true });

replySchema.index({ userId: 1, commentId: 1 });

export const Reply = model('Reply', replySchema);
