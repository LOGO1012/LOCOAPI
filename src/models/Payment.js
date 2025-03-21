import mongoose from 'mongoose';
import { User }from './UserProfile.js';
import { Product } from './Product.js';

const { Schema, model } = mongoose;

/**
 * Payment 스키마
 * - userId: 결제를 요청한 사용자의 ID (User 컬렉션 참조)
 * - product: 결제할 상품(Product) ID (Product 컬렉션 참조)
 * - paymentMethod: 결제 방식 (예: 'kakaopay', 'naverpay', 'toss')
 * - payPolicy: 결제 약관 동의 여부
 * - payPrice: 결제 금액
 * - payStatus: 결제 상태 ('pending', 'completed', 'failed')
 * - payId: 결제 게이트웨이에서 발급받은 거래 ID
 * - productDate: 결제 완료 시각 (payStatus가 'completed'일 때 기록)
 */

const paymentSchema = new Schema({
    userId: {
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
        enum: ['kakaopay', 'naverpay', 'toss'],
        required: true,
    },
    payPolicy: {
        type: Boolean,          // 약관 동의: 사용자가 약관에 동의했는지 여부 (true: 동의, false: 미동의)
        default: false
    },
    payPrice: {
        type: Number,
        required: true,
    },
    payStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending',
    },
    payId: {
        type: String,
        default: '',
    },
    productDate: {
        type: Date,
        default: function () {
            // 필드명이 payStatus이므로 이를 참고합니다.
            return this.payStatus === 'completed' ? new Date() : null;
        }
    },
    sid: {
        type: String,
        default: ''
    },
    kakaoResponse: {
        type: Schema.Types.Mixed
    },
    partner_order_id: {
        type: String,
        required: true
    },

}, { timestamps: true });

export const Payment = model('Payment', paymentSchema);
