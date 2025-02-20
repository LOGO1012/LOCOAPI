import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/**
 * Payment 스키마
 * - user: 결제를 요청한 사용자의 ID (User 컬렉션 참조)
 * - product: 결제할 상품(Product) ID (Product 컬렉션 참조)
 * - paymentMethod: 결제 방식 (예: 'card', 'toss', 'bank_transfer')
 * - amount: 결제 금액
 * - status: 결제 상태 ('pending', 'completed', 'failed')
 * - transactionId: 결제 게이트웨이에서 발급받은 거래 ID (임시 또는 빈 문자열)
 * - createdAt: 결제 요청 시각
 */

const paymentSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    product: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    paymentMethod: {
        type: String,
        enum: ['card', 'toss', 'bank_transfer'],
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending',
    },
    transactionId: {
        type: String,
        default: '',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
}, { timestamps: true });

export const Payment = model('Payment', paymentSchema);
