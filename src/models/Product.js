import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/**
 * Product 스키마
 * - productName: 상품 이름 (예: 'Premium Plan', 'Coin Pack 1000')
 * - productType: 'subscription'(구독) 또는 'coin'(재화)로 구분
 * - description: 상품 설명
 * - productPrice: 상품 가격
 * - durationInDays: 구독 상품의 경우 유효 기간 (예: 30일, 365일) - coin 상품은 null
 * - coinAmount: 코인 상품의 경우 제공되는 코인 수 - subscription은 null
 * - active: 상품 판매 여부
 */

const productSchema = new Schema({
    productName: {
        type: String,
        required: true,
        unique: true, // 같은 이름의 상품은 중복될 수 없음
    },
    productType: {
        type: String,
        enum: ['subscription', 'coin'],
        required: true,
    },
    description: {
        type: String,
        default: '',
    },
    productPrice: {
        type: Number,
        required: true,
    },
    durationInDays: {
        type: Number,
        default: null, // 구독 상품인 경우에만 값이 들어갑니다.
    },
    coinAmount: {
        type: Number,
        default: null, // 코인 상품인 경우에만 값이 들어갑니다.
    },
    active: {
        type: Boolean,
        default: true,
    }
}, { timestamps: true });

export const Product = model('Product', productSchema);
