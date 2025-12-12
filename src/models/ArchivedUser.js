// src/models/ArchivedUser.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const archivedUserSchema = new Schema({
    originalUserId: {
        type: Schema.Types.ObjectId,
        required: true,
        index: true,
    },
    social: {
        type: Object,
        required: true,
    },
    archivedAt: {
        type: Date,
        default: Date.now,
    },
}, {
    timestamps: true // createdAt will be automatically added
});

archivedUserSchema.index({ "social.kakao.providerId_hash": 1 });
archivedUserSchema.index({ "social.naver.providerId_hash": 1 });

export const ArchivedUser = model('ArchivedUser', archivedUserSchema);
