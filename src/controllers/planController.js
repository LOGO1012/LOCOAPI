// src/controllers/planController.js
import { User } from '../models/UserProfile.js';
import { Product } from '../models/Product.js';

/**
 * 유저의 구독 정보를 업데이트합니다.
 * - userId: 결제를 한 유저의 ID
 * - productId: 구독 상품의 ID (partner_order_id로 전달됨)
 *
 * 구독 상품인 경우, 상품의 durationInDays와 subscriptionTier를 기준으로
 * 구독 시작일과 종료일, 구독 타입을 업데이트합니다.
 */
export const updateUserPlan = async (userId, productId) => {
    // DB에서 상품 정보를 조회
    const product = await Product.findById(productId);
    if (!product) {
        throw new Error("상품 정보를 찾을 수 없습니다.");
    }
    // 구독 상품이 아닌 경우 업데이트하지 않음
    if (product.productType !== 'subscription') {
        return;
    }
    const now = new Date();
    // 상품에 지정된 구독 기간(durationInDays)이 없으면 기본 30일로 설정
    const duration = product.durationInDays || 30;
    const endDate = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);

    await User.findByIdAndUpdate(userId, {
        "plan.planName":  product.productName       || '',
        "plan.isPlan": true,
        "plan.planType": product.subscriptionTier || '',
        "plan.startDate": now,
        "plan.endDate": endDate
    });
};
