import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/**
 * PaymentHistory 스키마
 * - userId: 결제한 사용자의 ID (User 컬렉션 참조)
 * - paymentId: 관련 결제(Payment) 문서의 ID (Payment 컬렉션 참조)
 * - payPrice: 결제 금액 (실제 결제된 금액)
 * - paymentMethod: 결제 방식
 * - payStatus: 최종 결제 상태 ('completed' 또는 'failed')
 * - payId: 결제 거래 ID
 */

const paymentHistorySchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    paymentId: {
        type: Schema.Types.ObjectId,
        ref: 'Payment',
        required: true,
    },
    payPrice: {
        type: Number,
        required: true,
    },
    paymentMethod: {
        type: String,
        required: true,
    },
    payStatus: {
        type: String,
        enum: ['completed', 'failed'],
        required: true,
    },
    payId: {
        type: String,
        required: true,
        default: '' // 결제 실패 시 빈 값 처리
    },
    // 정기 결제의 SID (옵션)
    sid: {
        type: String,
        default: ''
    },
    // 결제 금액 세부 내역, 카드 정보 등을 저장 (옵션)
    amountDetails: {
        type: Schema.Types.Mixed
    },
    cardInfo: {
        type: Schema.Types.Mixed
    },
}, { timestamps: true });

export const PaymentHistory = model('PaymentHistory', paymentHistorySchema);
