import mongoose from "mongoose";

const { Schema, model } = mongoose;

const userHistorySchema = new Schema({
    originalUserId: { type: Schema.Types.ObjectId, required: true, index: true },
    archivedAt: { type: Date, default: Date.now },
    reason: { type: String, default: 'new_start_from_deactivated' },
    archivedData: { type: Schema.Types.Mixed }
});

export const UserHistory = model('UserHistory', userHistorySchema);
