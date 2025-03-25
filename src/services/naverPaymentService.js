// src/services/naverPaymentService.js
import { Payment } from '../models/Payment.js';
import { PaymentHistory } from '../models/PaymentHistory.js';

/**
 * 네이버페이 승인 API 응답 데이터를 기반으로 Payment 레코드를 업데이트합니다.
 * @param {Object} approvalData - 네이버페이 승인 API 응답 데이터 (예: { tid, sid, amount, card_info, ... })
 * @param {String} orderId - 결제 주문번호 (partner_order_id)
 * @returns {Object} 업데이트된 Payment 문서
 */
export const updatePaymentRecord = async (approvalData, orderId) => {
    // 결제 준비 시 저장한 partner_order_id와 pending 상태의 Payment 기록 조회
    const paymentRecord = await Payment.findOne({
        partner_order_id: orderId,
        payStatus: 'pending'
    });
    if (!paymentRecord) {
        throw new Error("결제 기록을 찾을 수 없습니다.");
    }

    // 승인 응답 데이터를 기반으로 Payment 레코드 업데이트
    paymentRecord.payStatus = 'completed';
    paymentRecord.payId = approvalData.tid;       // 승인 응답의 거래 ID 저장
    paymentRecord.sid = approvalData.sid;         // 발급받은 정기결제 SID 저장 (네이버 전용)
    paymentRecord.naverResponse = approvalData;   // 네이버 응답 전체를 저장 (필요 시)
    paymentRecord.productDate = new Date();       // 결제 완료 일시 업데이트
    await paymentRecord.save();
    return paymentRecord;
};

/**
 * 네이버페이 승인 후 결제 이력을 생성합니다.
 * @param {Object} paymentRecord - 업데이트된 Payment 문서
 * @param {Object} approvalData - 네이버페이 승인 API 응답 데이터
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
        amountDetails: approvalData.amount,   // 결제 금액 세부 내역 (공식 문서에 따른 필드명)
        cardInfo: approvalData.card_info        // 카드 정보 등 (필요 시)
    });
};
