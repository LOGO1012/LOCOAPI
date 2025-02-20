import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/**
 * PaymentHistory 스키마
 * - user: 결제한 사용자의 ID (User 컬렉션 참조)
 * - payment: 관련 결제(Payment) 문서의 ID (Payment 컬렉션 참조)
 * - amount: 결제 금액 (실제 결제된 금액)
 * - paymentMethod: 결제 방식
 * - status: 최종 결제 상태 ('completed' 또는 'failed')
 * - transactionId: 결제 거래 ID
 * - processedAt: 결제 내역이 기록된 시각
 */

const paymentHistorySchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    payment: {
        type: Schema.Types.ObjectId,
        ref: 'Payment',
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    paymentMethod: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['completed', 'failed'],
        required: true,
    },
    transactionId: {
        type: String,
        required: true,
    },
    processedAt: {
        type: Date,
        default: Date.now,
    },
}, { timestamps: true });

export const PaymentHistory = model('PaymentHistory', paymentHistorySchema);
