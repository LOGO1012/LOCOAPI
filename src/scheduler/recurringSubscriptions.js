//정기결제 스케쥴러
// scheduler/recurringSubscriptions.js
import cron from 'node-cron';
import { Payment } from '../models/Payment.js';
import { Product } from '../models/Product.js';
import { kakaoPaySubscriptionApi } from '../services/kakaoPayApi.js';
import { createPaymentHistoryRecord } from '../services/kakaoPaymentService.js';

// 매일 자정(00:00)에 실행하는 스케줄러 예시
cron.schedule('0 0 * * *', async () => {
    console.log("정기 결제 스케줄러 실행됨:", new Date());
    const now = new Date();
    try {
        // 모든 완료된(첫 결제 완료된) 구독 Payment 기록을 조회
        const payments = await Payment.find({
            paymentMethod: 'kakaopay',
            payStatus: 'completed',
        });

        // 각 Payment 레코드에 대해 다음 결제 예정일 계산
        for (let payment of payments) {
            // Payment에 연결된 상품 정보를 조회 (상품 스키마에는 durationInDays가 있음)
            const product = await Product.findById(payment.product);
            if (!product) continue; // 상품이 없으면 패스

            // 마지막 결제일(productDate) + durationInDays를 계산하여 다음 결제 예정일 산출
            const nextPaymentDate = new Date(payment.productDate);
            nextPaymentDate.setDate(nextPaymentDate.getDate() + product.durationInDays);

            if (now >= nextPaymentDate) {
                // 만료되어 정기결제 진행 대상
                const data = {
                    cid: process.env.KAKAO_CID || 'TCSUBSCRIP',
                    sid: payment.sid,  // 첫 결제 시 발급받은 SID (정기결제용)
                    partner_order_id: payment.partner_order_id,
                    partner_user_id: payment.userId,
                    item_name: product.productName,
                    quantity: 1,
                    total_amount: payment.payPrice,
                    vat_amount: 0,
                    tax_free_amount: 0,
                };

                try {
                    console.log(`정기결제 요청 (PaymentID: ${payment._id}) 데이터:`, data);
                    const response = await kakaoPaySubscriptionApi(data);
                    console.log("정기결제 응답:", response.data);
                    // Payment 레코드를 업데이트 : 새로운 tid와 productDate 업데이트
                    payment.payId = response.data.tid;
                    payment.productDate = new Date(); // 이번 결제일로 업데이트
                    await payment.save();
                    // PaymentHistory 기록 생성 (결제 내역 저장)
                    await createPaymentHistoryRecord(payment, response.data);
                } catch (err) {
                    console.error(`정기결제 처리 오류 (PaymentID: ${payment._id}):`, err.response ? err.response.data : err.message);
                }
            }
        }
    } catch (error) {
        console.error("정기 결제 스케줄러 실행 중 오류:", error);
    }
});
//실제 운영환경에서는 결제 실패 시 재시도 로직이나, 개별 결제 상태를 좀 더 세밀하게 관리하는 로직이 필요할 수 있습니다.
//위 예시는 매일 자정에 모든 Payment 레코드를 순회하여, 마지막 결제일(productDate) 기준으로 durationInDays가 지난 경우 자동 결제 요청을 보냅니다.
