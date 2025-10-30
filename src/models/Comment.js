// src/models/Comment.js

import mongoose from 'mongoose';
import {pollSchema} from "./Poll.js";

const { Schema, model } = mongoose;

export const commentSchema = new Schema({
    postId: {
        type: Schema.Types.ObjectId,
        ref: 'Community',
        required: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    userNickname: {
        type: String,
        default: ''
    },
    commentContents: {
        type: String,
        required: true,
    },
    commentImage: {
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
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
    polls: [pollSchema],
}, { timestamps: true });

commentSchema.index({ userId: 1, postId: 1 });

export const Comment = model('Comment', commentSchema);
