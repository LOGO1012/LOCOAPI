// /src/services/kakaoPaymentService.js
import { Payment } from '../models/Payment.js';
import { PaymentHistory } from '../models/PaymentHistory.js';

/**
 * 승인 응답 데이터를 기반으로 Payment 레코드를 업데이트합니다.
 * @param {Object} approvalData - 카카오 승인 API 응답 데이터
 * @param {String} partnerOrderId - 결제 주문번호
 * @returns {Object} 업데이트된 Payment 문서
 */
export const updatePaymentRecord = async (approvalData, partnerOrderId) => {
    // 결제 준비 시 저장한 partner_order_id와 pending 상태의 Payment 기록을 찾습니다.
    const paymentRecord = await Payment.findOne({
        partner_order_id: partnerOrderId,
        payStatus: 'pending'
    });
    if (!paymentRecord) {
        throw new Error("결제 기록을 찾을 수 없습니다.");
    }

    // 승인 응답 데이터를 기반으로 Payment 레코드 업데이트
    paymentRecord.payStatus = 'completed';
    paymentRecord.payId = approvalData.tid; // 승인 응답의 tid 저장
    paymentRecord.sid = approvalData.sid;   // 발급받은 SID 저장
    paymentRecord.kakaoResponse = approvalData;
    paymentRecord.productDate = new Date();
    await paymentRecord.save();
    return paymentRecord;
};

/**
 * PaymentHistory 레코드를 생성합니다.
 * @param {Object} paymentRecord - 업데이트된 Payment 문서
 * @param {Object} approvalData - 카카오 승인 API 응답 데이터
 */
export const createPaymentHistoryRecord = async (paymentRecord, approvalData) => {
    await PaymentHistory.create({
        userId: paymentRecord.userId,
        paymentId: paymentRecord._id,
        payPrice: paymentRecord.payPrice,
        paymentMethod: paymentRecord.paymentMethod,
        payStatus: 'completed',
        payId: approvalData.tid,
        sid: approvalData.sid,
        amountDetails: approvalData.amount,
        cardInfo: approvalData.card_info
    });
};
