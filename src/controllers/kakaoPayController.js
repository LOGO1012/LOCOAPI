import { Product } from '../models/Product.js';
import { Payment } from '../models/Payment.js';
import dotenv from 'dotenv';
import { kakaoPayReadyApi, kakaoPaySubscriptionApi, kakaoPayApproveApi } from "../services/kakaoPayApi.js";
import { updatePaymentRecord, createPaymentHistoryRecord } from "../services/kakaoPaymentService.js";

dotenv.config();
const KAKAO_SECRET_KEY = process.env.KAKAO_SECRET_KEY
const KAKAO_SUBSCRIPTION_CID = process.env.KAKAO_CID || 'TCSUBSCRIP';
/**
 * 최초 정기 결제(1회차) 준비
 */
export const kakaoPaySubscribeReady = async (req, res) => {
    console.log("kakaoPaySubscribeReady 호출됨. 요청 본문:", req.body);

    const { productId, amount } = req.body;
    const userId = req.userId;  // 인증 미들웨어를 통해 설정된 값 사용

    // productId로 상품 정보를 DB에서 조회
    let product;
    try {
        product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ error: "상품을 찾을 수 없습니다." });
        }
    } catch (err) {
        console.error("상품 조회 중 오류:", err.message);
        return res.status(500).json({ error: "상품 조회 중 오류 발생" });
    }

    // 실제 상품 정보를 사용
    const productName = req.body.productName || product.productName;
    const quantity = 1;

    // Payment 레코드를 결제 준비 단계에서 미리 생성 (첫 결제의 경우)
    let newPayment;
    try {
        newPayment = new Payment({
            userId: userId,
            product: productId,
            paymentMethod: 'kakaopay',
            payPrice: amount,
            payStatus: 'pending',
            partner_order_id: productId, // 필요에 따라 고유 주문 번호 생성 고려
        });
        await newPayment.save();
    } catch (err) {
        console.error("Payment 레코드 생성 오류:", err.message);
        return res.status(500).json({ error: "결제 기록 생성 오류" });
    }


    const data = {
        cid: KAKAO_SUBSCRIPTION_CID,           // 가맹점 코드, 10자 (테스트: "TC0ONETIME")
        partner_order_id: productId,           // 가맹점 주문번호 (예: 상품 ID)
        partner_user_id: userId,               // 가맹점 회원 id
        item_name: productName,                // 상품명, 최대 100자
        quantity: quantity,                    // 상품 수량 (정수)
        total_amount: Number(amount),          // 상품 총액 (정수)
        tax_free_amount: 0,                    // 상품 비과세 금액 (정수)
        vat_amount: 0,                         // 상품 부가세 금액 (생략 시 자동 계산)
        auto_approve: true, // 정기 결제의 경우 자동 승인을 사용할 수 있다면 활성화
        approval_url: `${process.env.BASE_URL}/api/kakao-pay/subscribe/approve?partner_order_id=${productId}`,
        cancel_url: `${process.env.BASE_URL}/api/kakao-pay/subscribe/cancel`,
        fail_url: `${process.env.BASE_URL}/api/kakao-pay/subscribe/fail`
    };

    console.log("Kakao Pay API에 보낼 JSON 데이터:", JSON.stringify(data));
    console.log("사용하는 결제용 키 (KAKAO_SECRET_KEY):", KAKAO_SECRET_KEY);

    try {
        const response = await kakaoPayReadyApi(data);
        console.log("Kakao Pay API 응답:", response.data);
        // Ready API 호출 후 반환받은 tid를 Payment 레코드에 저장
        newPayment.payId = response.data.tid;
        await newPayment.save();
        res.json(response.data);
    } catch (error) {
        console.error('KakaoPay ready error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'KakaoPay 준비 실패' });
    }
};

/**
 * [정기 결제 2회 차 이후] - 서버에 저장된 SID를 사용하여 2회 차 이상 결제를 진행
 */

export const kakaoPaySubscription = async (req, res) => {
    console.log("kakaoPaySubscription 호출됨. 요청 본문:", req.body);

    // 2회 차 결제 시에는 이전에 발급받은 SID를 사용합니다.
    const { sid, productId, amount } = req.body;        //, partnerUserId
    const userId = req.userId;

    // DB에서 상품 정보를 조회하여 실제 상품명을 사용
    let product;
    try {
        product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ error: "상품을 찾을 수 없습니다." });
        }
    } catch (err) {
        console.error("상품 조회 중 오류:", err.message);
        return res.status(500).json({ error: "상품 조회 중 오류 발생" });
    }

    const productName = product.productName;
    const quantity = 1;

    const data = {
        cid: KAKAO_SUBSCRIPTION_CID,
        sid: sid,  // 최초 결제 후 발급받은 SID (서버에 저장되어 있어야 함)
        partner_order_id: productId,
        partner_user_id: userId,                   //partnerUserId,
        item_name: productName,
        quantity: quantity,
        total_amount: Number(amount),
        vat_amount: 0,
        tax_free_amount: 0
    };

    console.log("Kakao Pay 구독 결제 요청에 보낼 JSON 데이터:", JSON.stringify(data));
    try {
        const response = await kakaoPaySubscriptionApi(data);
        console.log("Kakao Pay 구독 결제 응답:", response.data);
        res.json(response.data);
    } catch (error) {
        console.error("KakaoPay subscription error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'KakaoPay 구독 결제 실패' });
    }
};


/**
 * 결제 승인 콜백
 * 카카오가 pg_token 등과 함께 리다이렉트할 때 호출됩니다.
 * 여기서 pg_token을 이용해 카카오 승인 API를 호출하고, DB 업데이트 로직(서비스)을 실행합니다.
 */
export const kakaoPaySubscribeApprove = async (req, res) => {
    console.log("kakaoPaySubscribeApprove 호출됨. 요청 쿼리:", req.query);
    const { pg_token, partner_order_id } = req.query;

    // Payment 레코드 조회 (결제 준비 단계에서 생성되었어야 함)
    const paymentRecord = await Payment.findOne({
        partner_order_id,
        payStatus: 'pending'
    });
    if (!paymentRecord) {
        return res.status(404).json({ error: 'Payment record not found' });
    }


    try {
        // 승인 API 호출에 필요한 데이터 구성
        // 실제 서비스에서는 결제 준비 시 저장된 tid를 사용해야 합니다.
        const approvalData = {
            cid: KAKAO_SUBSCRIPTION_CID,
            tid: paymentRecord.payId,  // 여기에는 Payment 생성 시 저장한 tid 값을 사용해야 합니다.
            partner_order_id: partner_order_id,
            partner_user_id: paymentRecord.userId.toString(), // 실제 partner_user_id 값을 사용
            pg_token: pg_token
        };

        console.log("Kakao Pay 승인 요청 데이터:", approvalData);

        const approveResponse = await kakaoPayApproveApi(approvalData);

        console.log("Kakao Pay 승인 응답:", approveResponse.data);

        // DB 업데이트: Payment 레코드 업데이트 및 PaymentHistory 생성 (서비스 사용)
        const updatedPaymentRecord  = await updatePaymentRecord(approveResponse.data, partner_order_id);
        await createPaymentHistoryRecord(updatedPaymentRecord, approveResponse.data);

        // 결제 성공 후, 클라이언트에서 읽을 수 있는 쿠키를 설정 (예: 30초 동안 유지)
        res.cookie('paymentSuccess', 'true', { maxAge: 30000, httpOnly: false });
        // 결제 승인 후 프론트엔드의 구독 성공 페이지로 리다이렉트 (모달로 구독 완료 메시지 표시)
        return res.redirect(`${process.env.BASE_URL_FRONT}/`);
    } catch (error) {
        console.error("KakaoPay subscribe approve error:", error.response ? error.response.data : error.message);
        return res.status(500).send("결제 승인 처리 중 오류가 발생했습니다.");
    }
};

/**
 * 결제 취소 콜백
 */
export const kakaoPaySubscribeCancel = async (req, res) => {
    console.log("kakaoPaySubscribeCancel 호출됨. 요청 쿼리:", req.query);
    res.send("구독 결제 취소");
};

/**
 * 결제 실패 콜백
 */
export const kakaoPaySubscribeFail = async (req, res) => {
    console.log("kakaoPaySubscribeFail 호출됨. 요청 쿼리:", req.query);
    res.send("구독 결제 실패");
};