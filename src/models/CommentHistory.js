import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const commentHistorySchema = new Schema({
    commentId: {
        type: Schema.Types.ObjectId,
        ref: 'Comment',
        required: true,
        index: true
    },
    contents: {
        type: String,
        required: true
    }
}, { timestamps: { createdAt: true, updatedAt: false }});

export const CommentHistory = model('CommentHistory', commentHistorySchema);
