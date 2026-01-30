import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const communityHistorySchema = new Schema({
    postId: {
        type: Schema.Types.ObjectId,
        ref: 'Community',
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

export const CommunityHistory = model('CommunityHistory', communityHistorySchema);
