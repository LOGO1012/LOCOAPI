import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const reportNotificationSchema = new Schema({
    receiver: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: true
    },
    // 'reportAnswer'는 신고 답변, 'sanctionInfo'는 제재 정보를 의미
    type: {
        type: String,
        enum: ['reportAnswer', 'sanctionInfo'],
        required: true
    },
    isRead: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

reportNotificationSchema.index({ receiver: 1, isRead: 1, createdAt: -1 });

export const ReportNotification = model('Notification', reportNotificationSchema);
