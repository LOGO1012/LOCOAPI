import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const qnaHistorySchema = new Schema({
    qnaId: {
        type: Schema.Types.ObjectId,
        ref: 'Qna',
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true
    },
    contents: {
        type: String,
        required: true
    }
}, { timestamps: { createdAt: true, updatedAt: false }});

export const QnaHistory = model('QnaHistory', qnaHistorySchema);
