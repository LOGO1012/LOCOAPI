import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const replyHistorySchema = new Schema({
    replyId: {
        type: Schema.Types.ObjectId,
        ref: 'Reply',
        required: true,
        index: true
    },
    contents: {
        type: String,
        required: true
    }
}, { timestamps: { createdAt: true, updatedAt: false }});

export const ReplyHistory = model('ReplyHistory', replyHistorySchema);
