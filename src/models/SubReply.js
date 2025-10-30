// src/models/SubReply.js

import mongoose from 'mongoose';
import {commentSchema} from "./Comment.js";

const { Schema, model } = mongoose;

const subReplySchema = new Schema({
    replyId: {
        type: Schema.Types.ObjectId,
        ref: 'Reply',
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
    subReplyImage: {
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
}, { timestamps: true });

subReplySchema.index({ userId: 1, replyId: 1 });

export const SubReply = model("SubReply", subReplySchema);

