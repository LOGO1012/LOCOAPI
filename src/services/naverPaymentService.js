import { Payment } from '../models/Payment.js';
import { PaymentHistory } from '../models/PaymentHistory.js';

export const updatePaymentRecord = async (approvalData, orderId) => {
    try {
        const paymentRecord = await Payment.findOne({
            partner_order_id: orderId,
            payStatus: 'pending'
        });
        if (!paymentRecord) {
            throw new Error(`결제 기록을 찾을 수 없습니다. 주문번호: ${orderId}`);
        }

        paymentRecord.payStatus = 'completed';
        paymentRecord.payId = approvalData.tid || approvalData.paymentId;
        paymentRecord.sid = approvalData.sid;
        paymentRecord.productDate = new Date();
        await paymentRecord.save();
        console.log("Payment 업데이트 완료:", paymentRecord);
        return paymentRecord;
    } catch (error) {
        throw new Error(`Payment 업데이트 실패 (orderId: ${orderId}): ${error.message}`);
    }
};

export const createPaymentHistoryRecord = async (paymentRecord, approvalData) => {
    try {
        await PaymentHistory.create({
            userId: paymentRecord.userId,
            paymentId: paymentRecord._id,
            payPrice: paymentRecord.payPrice,
            paymentMethod: paymentRecord.paymentMethod,
            payStatus: 'completed',
            payId: approvalData.tid || approvalData.paymentId,
            sid: approvalData.sid,
            amountDetails: approvalData.amount,
            cardInfo: approvalData.card_info,
        });
        console.log("PaymentHistory 생성 완료");
    } catch (error) {
        throw new Error(`PaymentHistory 생성 실패 (Payment ID: ${paymentRecord._id}): ${error.message}`);
    }
};
