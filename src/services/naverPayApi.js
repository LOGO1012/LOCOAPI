import axios from 'axios';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
dotenv.config();

const NAVER_PAY_CLIENT_ID = process.env.NAVER_PAY_CLIENT_ID;
const NAVER_PAY_CLIENT_SECRET = process.env.NAVER_PAY_CLIENT_SECRET;
const NAVER_PAY_CHAIN_ID = process.env.NAVER_PAY_CHAIN_ID;
const NAVER_PAY_PARTNER_ID = process.env.NAVER_PAY_PARTNER_ID;
const NAVER_PAY_CID = process.env.NAVER_PAY_CID;

const BASE_URL =
    process.env.NODE_ENV === 'production'
        ? `https://apis.naver.com/${NAVER_PAY_PARTNER_ID}`
        : `https://dev-pub.apis.naver.com/${NAVER_PAY_PARTNER_ID}`;

export const naverPayApproveApi = async (data) => {
    // 개선사항 ⑦: 전달된 idempotencyKey가 있으면 재사용, 없으면 새로 생성
    const idempotencyKey = data.idempotencyKey || uuidv4();
    const params = new URLSearchParams();
    // 개선사항 ①: 네이버페이 승인 API에 필요한 모든 파라미터 전송
    params.append('paymentId', data.tid || data.paymentId);
    // params.append('partner_order_id', data.partner_order_id);
    // params.append('partner_user_id', data.partner_user_id);

    console.log("네이버페이 승인 API 호출 준비");

    try {
        const response = await axios.post(
            `${BASE_URL}/naverpay/payments/v2.2/apply/payment`,
            params,
            {
                timeout: 60000,
                headers: {
                    'X-Naver-Client-Id': NAVER_PAY_CLIENT_ID,
                    'X-Naver-Client-Secret': NAVER_PAY_CLIENT_SECRET,
                    'X-NaverPay-Chain-Id': NAVER_PAY_CHAIN_ID,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-NaverPay-Idempotency-Key': idempotencyKey,
                },
            }
        );
        console.log("네이버페이 승인 API 호출 성공");
        return response;
    } catch (error) {
        console.error(
            "네이버페이 승인 API 호출 오류:",
            error.response ? error.response.data : error.message
        );
        throw error;
    }
};
