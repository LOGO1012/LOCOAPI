// src/controllers/naverPayController.js
import axios from 'axios';
import { Payment } from '../models/Payment.js';
import { Product } from '../models/Product.js';
import dotenv from 'dotenv';
import { naverPayReadyApi, naverPayApproveApi } from '../services/naverPayApi.js';
import { updatePaymentRecord, createPaymentHistoryRecord } from '../services/kakaoPaymentService.js'; // Payment 업데이트 로직은 공통으로 사용 가능
dotenv.config();

export const naverPayReady = async (req, res) => {
    console.log("naverPayReady 호출됨. 요청 본문:", req.body);
    const { productId, amount, partnerUserId } = req.body;

    // 상품 조회
    let product;
    try {
        product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ error: "상품을 찾을 수 없습니다." });
        }
    } catch (err) {
        console.error("상품 조회 오류:", err.message);
        return res.status(500).json({ error: "상품 조회 오류" });
    }
    const productName = product.productName;
    const quantity = 1;

    // 첫 결제를 위해 Payment 레코드 생성 (pending 상태)
    let newPayment;
    try {
        newPayment = new Payment({
            userId: partnerUserId,
            product: productId,
            paymentMethod: 'naverpay',
            payPrice: amount,
            payStatus: 'pending',
            partner_order_id: productId,  // 예시로 상품 ID를 주문번호로 사용
        });
        await newPayment.save();
    } catch (err) {
        console.error("Payment 생성 오류:", err.message);
        return res.status(500).json({ error: "결제 기록 생성 오류" });
    }

    // 네이버페이 준비 요청 데이터 구성
    const data = {
        productId: productId,
        productName: productName,
        amount: amount,
        orderId: productId,
        returnUrl: `${process.env.BASE_URL}/api/naver-pay/approve?orderId=${productId}`,
        cancelUrl: `${process.env.BASE_URL}/api/naver-pay/cancel`,
        // 추가 필드가 필요하면 여기에 작성
    };

    console.log("Naver Pay API에 보낼 JSON 데이터:", JSON.stringify(data));

    try {
        const response = await naverPayReadyApi(data);
        console.log("Naver Pay API 응답:", response.data);
        // 네이버페이의 응답에서 tid와 유사한 값을 Payment 레코드에 저장
        newPayment.payId = response.data.tid; // 실제 네이버 응답 키에 맞게 수정
        await newPayment.save();
        res.json(response.data);
    } catch (error) {
        console.error("NaverPay ready error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'NaverPay 준비 실패' });
    }
};

export const naverPayApprove = async (req, res) => {
    console.log("naverPayApprove 호출됨. 요청 쿼리:", req.query);
    const { orderId, pg_token } = req.query;

    // Payment 레코드 조회
    const paymentRecord = await Payment.findOne({
        partner_order_id: orderId,
        payStatus: 'pending'
    });
    if (!paymentRecord) {
        return res.status(404).json({ error: 'Payment record not found' });
    }

    try {
        const approvalData = {
            orderId: orderId,
            tid: paymentRecord.payId,
            partner_user_id: paymentRecord.userId,
            pg_token: pg_token
        };

        console.log("Naver Pay 승인 요청 데이터:", approvalData);

        const approveResponse = await naverPayApproveApi(approvalData);
        console.log("Naver Pay 승인 응답:", approveResponse.data);

        const updatedPaymentRecord = await updatePaymentRecord(approveResponse.data, orderId);
        await createPaymentHistoryRecord(updatedPaymentRecord, approveResponse.data);

        return res.redirect(`${process.env.BASE_URL_FRONT}/subscription/success`);
    } catch (error) {
        console.error("NaverPay approve error:", error.response ? error.response.data : error.message);
        return res.status(500).send("결제 승인 처리 중 오류가 발생했습니다.");
    }
};

export const naverPayCancel = (req, res) => {
    console.log("NaverPay cancel 호출됨. 요청 쿼리:", req.query);
    res.send("네이버 페이 결제 취소");
};

export const naverPayFail = (req, res) => {
    console.log("NaverPay fail 호출됨. 요청 쿼리:", req.query);
    res.send("네이버 페이 결제 실패");
};
