import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const subReplyHistorySchema = new Schema({
    subReplyId: {
        type: Schema.Types.ObjectId,
        ref: 'SubReply',
        required: true,
        index: true
    },
    contents: {
        type: String,
        required: true
    }
}, { timestamps: { createdAt: true, updatedAt: false }});

export const SubReplyHistory = model('SubReplyHistory', subReplyHistorySchema);
