import { Product } from '../models/Product.js';
import { Payment } from '../models/Payment.js';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { naverPayApproveApi } from '../services/naverPayApi.js';
import { updatePaymentRecord, createPaymentHistoryRecord } from '../services/naverPaymentService.js';
import { updateUserPlan } from './planController.js';

dotenv.config();
const NAVER_PAY_CID = process.env.NAVER_PAY_CID || 'TCNAVERPAY';

// 공통 에러 응답 함수
const sendError = (res, status, message) => {
    return res.status(status).json({ success: false, error: message });
};

export const reserveOrder = async (req, res) => {
    console.log("===== reserveOrder 호출 =====");
    console.log("요청 본문:", req.body);

    const { productId, amount } = req.body;
    // 필수 파라미터 검증
    if (!productId || !amount) {
        return sendError(res, 400, "필수 파라미터(productId, amount)가 누락되었습니다.");
    }
    const userId = req.userId;
    if (!userId) {
        console.error("User ID 없음");
        return sendError(res, 400, "User ID가 필요합니다.");
    }

    let product;
    try {
        product = await Product.findById(productId);
        if (!product) {
            console.error("상품을 찾을 수 없음:", productId);
            return sendError(res, 404, "상품을 찾을 수 없습니다.");
        }
    } catch (err) {
        console.error("상품 조회 오류:", err.message);
        return sendError(res, 500, "상품 조회 오류");
    }

    const merchantPayKey = uuidv4();
    console.log("생성된 merchantPayKey:", merchantPayKey);

    try {
        const newPayment = new Payment({
            userId: userId,
            product: productId,
            paymentMethod: 'naverpay',
            payPrice: amount,
            payStatus: 'pending',
            partner_order_id: merchantPayKey,
        });
        await newPayment.save();
        console.log("Payment 저장 성공:", newPayment);
        return res.json({ success: true, orderId: merchantPayKey });
    } catch (err) {
        console.error("Payment 생성 오류:", err.message);
        return sendError(res, 500, "결제 기록 생성 오류");
    }
};

export const naverPayApprove = async (req, res) => {
    console.log("===== naverPayApprove 호출 =====");
    console.log("요청 쿼리:", req.query);

    // pg_token 관련 부분 삭제됨
    const { merchantPayKey, resultCode, resultMessage, paymentId } = req.query;
    if (!merchantPayKey || !paymentId) {
        return sendError(res, 400, "필수 쿼리 파라미터가 누락되었습니다.");
    }
    console.log("merchantPayKey:", merchantPayKey);
    console.log("resultCode:", resultCode);
    console.log("resultMessage:", resultMessage);
    console.log("paymentId (쿼리):", paymentId);

    if (resultCode !== "Success") {
        console.error("결제 실패 - resultCode:", resultCode, "resultMessage:", resultMessage);
        return sendError(res, 400, "결제 실패: " + (resultMessage || "알 수 없는 오류"));
    }

    let paymentRecord;
    try {
        paymentRecord = await Payment.findOne({
            partner_order_id: merchantPayKey,
            payStatus: 'pending'
        });
        if (!paymentRecord) {
            console.error("Payment record not found for merchantPayKey:", merchantPayKey);
            return sendError(res, 404, 'Payment record not found');
        }
    } catch (err) {
        console.error("Payment 조회 오류:", err.message);
        return sendError(res, 500, "Payment 조회 오류");
    }

    try {
        const approvalData = {
            // cid 제거됨
            tid: paymentId, // 네이버페이 결제번호
            // partner_order_id: merchantPayKey,
            // partner_user_id: paymentRecord.userId.toString(),
            // pg_token 제거됨
        };
        console.log("Naver Pay 승인 요청 데이터:", approvalData);

        const approveResponse = await naverPayApproveApi(approvalData);
        console.log("Naver Pay 승인 응답:", approveResponse.data);

        if (approveResponse.data.code !== "Success") {
            console.error("승인 API 실패:", approveResponse.data.message);
            return sendError(res, 400, "승인 API 오류: " + approveResponse.data.message);
        }

        // 승인 응답에서 detail 정보 추출
        const detail =
            approveResponse.data.body && approveResponse.data.body.detail
                ? approveResponse.data.body.detail
                : approveResponse.data;
        const updatedPaymentRecord = await updatePaymentRecord(detail, merchantPayKey);
        console.log("업데이트된 Payment 기록:", updatedPaymentRecord);

        await createPaymentHistoryRecord(updatedPaymentRecord, detail);
        console.log("PaymentHistory 생성 완료");

        await updateUserPlan(paymentRecord.userId, merchantPayKey);
        console.log("User plan 업데이트 완료");

        return res.json({ success: true, message: "결제 승인 처리 완료" });
    } catch (error) {
        console.error(
            "NaverPay approve error:",
            error.response ? error.response.data : error.message
        );
        return sendError(res, 500, "결제 승인 처리 중 오류가 발생했습니다.");
    }
};

export const naverPayCancel = (req, res) => {
    console.log("===== naverPayCancel 호출 =====");
    console.log("요청 쿼리:", req.query);
    return res.json({ success: false, message: "네이버 페이 결제 취소 기능 미구현" });
};

export const naverPayFail = (req, res) => {
    console.log("===== naverPayFail 호출 =====");
    console.log("요청 쿼리:", req.query);
    return res.json({ success: false, message: "결제 실패 처리" });
};




// import { Product } from '../models/Product.js';
// import { Payment } from '../models/Payment.js';
// import dotenv from 'dotenv';
// import { v4 as uuidv4 } from 'uuid';
// import { naverPayApproveApi } from '../services/naverPayApi.js';
// import { updatePaymentRecord, createPaymentHistoryRecord } from '../services/naverPaymentService.js';
// import { updateUserPlan } from './planController.js';
//
// dotenv.config();
// const NAVER_PAY_CID = process.env.NAVER_PAY_CID || 'TCNAVERPAY';
//
// // 공통 에러 응답 함수
// const sendError = (res, status, message) => {
//     return res.status(status).json({ success: false, error: message });
// };
//
// export const reserveOrder = async (req, res) => {
//     console.log("===== reserveOrder 호출 =====");
//     console.log("요청 본문:", req.body);
//
//     const { productId, amount } = req.body;
//     // 필수 파라미터 검증
//     if (!productId || !amount) {
//         return sendError(res, 400, "필수 파라미터(productId, amount)가 누락되었습니다.");
//     }
//     const userId = req.userId;
//     if (!userId) {
//         console.error("User ID 없음");
//         return sendError(res, 400, "User ID가 필요합니다.");
//     }
//
//     let product;
//     try {
//         product = await Product.findById(productId);
//         if (!product) {
//             console.error("상품을 찾을 수 없음:", productId);
//             return sendError(res, 404, "상품을 찾을 수 없습니다.");
//         }
//     } catch (err) {
//         console.error("상품 조회 오류:", err.message);
//         return sendError(res, 500, "상품 조회 오류");
//     }
//
//     const merchantPayKey = uuidv4();
//     console.log("생성된 merchantPayKey:", merchantPayKey);
//
//     try {
//         const newPayment = new Payment({
//             userId: userId,
//             product: productId,
//             paymentMethod: 'naverpay',
//             payPrice: amount,
//             payStatus: 'pending',
//             partner_order_id: merchantPayKey,
//         });
//         await newPayment.save();
//         console.log("Payment 저장 성공:", newPayment);
//         return res.json({ success: true, orderId: merchantPayKey });
//     } catch (err) {
//         console.error("Payment 생성 오류:", err.message);
//         return sendError(res, 500, "결제 기록 생성 오류");
//     }
// };
//
// export const naverPayApprove = async (req, res) => {
//     console.log("===== naverPayApprove 호출 =====");
//     console.log("요청 쿼리:", req.query);
//
//     // pg_token 관련 부분 삭제됨
//     const { merchantPayKey, resultCode, resultMessage, paymentId } = req.query;
//     if (!merchantPayKey || !paymentId) {
//         return sendError(res, 400, "필수 쿼리 파라미터가 누락되었습니다.");
//     }
//     console.log("merchantPayKey:", merchantPayKey);
//     console.log("resultCode:", resultCode);
//     console.log("resultMessage:", resultMessage);
//     console.log("paymentId (쿼리):", paymentId);
//
//     if (resultCode !== "Success") {
//         console.error("결제 실패 - resultCode:", resultCode, "resultMessage:", resultMessage);
//         return sendError(res, 400, "결제 실패: " + (resultMessage || "알 수 없는 오류"));
//     }
//
//     let paymentRecord;
//     try {
//         paymentRecord = await Payment.findOne({
//             partner_order_id: merchantPayKey,
//             payStatus: 'pending'
//         });
//         if (!paymentRecord) {
//             console.error("Payment record not found for merchantPayKey:", merchantPayKey);
//             return sendError(res, 404, 'Payment record not found');
//         }
//     } catch (err) {
//         console.error("Payment 조회 오류:", err.message);
//         return sendError(res, 500, "Payment 조회 오류");
//     }
//
//     try {
//         const approvalData = {
//             cid: NAVER_PAY_CID,
//             tid: paymentId, // 네이버페이 결제번호
//             partner_order_id: merchantPayKey,
//             partner_user_id: paymentRecord.userId.toString(),
//             // pg_token 제거됨
//         };
//         console.log("Naver Pay 승인 요청 데이터:", approvalData);
//
//         const approveResponse = await naverPayApproveApi(approvalData);
//         console.log("Naver Pay 승인 응답:", approveResponse.data);
//
//         if (approveResponse.data.code !== "Success") {
//             console.error("승인 API 실패:", approveResponse.data.message);
//             return sendError(res, 400, "승인 API 오류: " + approveResponse.data.message);
//         }
//
//         // 승인 응답에서 detail 정보 추출
//         const detail =
//             approveResponse.data.body && approveResponse.data.body.detail
//                 ? approveResponse.data.body.detail
//                 : approveResponse.data;
//         const updatedPaymentRecord = await updatePaymentRecord(detail, merchantPayKey);
//         console.log("업데이트된 Payment 기록:", updatedPaymentRecord);
//
//         await createPaymentHistoryRecord(updatedPaymentRecord, detail);
//         console.log("PaymentHistory 생성 완료");
//
//         await updateUserPlan(paymentRecord.userId, merchantPayKey);
//         console.log("User plan 업데이트 완료");
//
//         return res.json({ success: true, message: "결제 승인 처리 완료" });
//     } catch (error) {
//         console.error(
//             "NaverPay approve error:",
//             error.response ? error.response.data : error.message
//         );
//         return sendError(res, 500, "결제 승인 처리 중 오류가 발생했습니다.");
//     }
// };
//
// export const naverPayCancel = (req, res) => {
//     console.log("===== naverPayCancel 호출 =====");
//     console.log("요청 쿼리:", req.query);
//     return res.json({ success: false, message: "네이버 페이 결제 취소 기능 미구현" });
// };
//
// export const naverPayFail = (req, res) => {
//     console.log("===== naverPayFail 호출 =====");
//     console.log("요청 쿼리:", req.query);
//     return res.json({ success: false, message: "결제 실패 처리" });
// };
//










// import { Product } from '../models/Product.js';
// import { Payment } from '../models/Payment.js';
// import dotenv from 'dotenv';
// import { v4 as uuidv4 } from 'uuid';
// import { naverPayApproveApi } from '../services/naverPayApi.js';
// import { updatePaymentRecord, createPaymentHistoryRecord } from '../services/naverPaymentService.js';
// import { updateUserPlan } from './planController.js';
//
// dotenv.config();
// const NAVER_PAY_CID = process.env.NAVER_PAY_CID || 'TCNAVERPAY';
//
// // 공통 에러 응답 함수 (개선사항 ③, ⑧)
// const sendError = (res, status, message) => {
//     return res.status(status).json({ success: false, error: message });
// };
//
// export const reserveOrder = async (req, res) => {
//     console.log("===== reserveOrder 호출 =====");
//     console.log("요청 본문:", req.body);
//
//     const { productId, amount } = req.body;
//     // 개선사항 ⑤: 필수 파라미터 검증
//     if (!productId || !amount) {
//         return sendError(res, 400, "필수 파라미터(productId, amount)가 누락되었습니다.");
//     }
//     const userId = req.userId;
//     if (!userId) {
//         console.error("User ID 없음");
//         return sendError(res, 400, "User ID가 필요합니다.");
//     }
//
//     let product;
//     try {
//         product = await Product.findById(productId);
//         if (!product) {
//             console.error("상품을 찾을 수 없음:", productId);
//             return sendError(res, 404, "상품을 찾을 수 없습니다.");
//         }
//     } catch (err) {
//         console.error("상품 조회 오류:", err.message);
//         return sendError(res, 500, "상품 조회 오류");
//     }
//
//     const merchantPayKey = uuidv4();
//     console.log("생성된 merchantPayKey:", merchantPayKey);
//
//     try {
//         const newPayment = new Payment({
//             userId: userId,
//             product: productId,
//             paymentMethod: 'naverpay',
//             payPrice: amount,
//             payStatus: 'pending',
//             partner_order_id: merchantPayKey,
//         });
//         await newPayment.save();
//         console.log("Payment 저장 성공:", newPayment);
//         return res.json({ success: true, orderId: merchantPayKey });
//     } catch (err) {
//         console.error("Payment 생성 오류:", err.message);
//         return sendError(res, 500, "결제 기록 생성 오류");
//     }
// };
//
// export const naverPayApprove = async (req, res) => {
//     console.log("===== naverPayApprove 호출 =====");
//     console.log("요청 쿼리:", req.query);
//
//     const { merchantPayKey, pg_token, resultCode, resultMessage, paymentId } = req.query;
//     // 개선사항 ⑤: 필수 쿼리 파라미터 검증
//     if (!merchantPayKey || !pg_token) {
//         return sendError(res, 400, "필수 쿼리 파라미터가 누락되었습니다.");
//     }
//     console.log("merchantPayKey:", merchantPayKey);
//     console.log("pg_token:", pg_token);
//     console.log("resultCode:", resultCode);
//     console.log("resultMessage:", resultMessage);
//     console.log("paymentId (쿼리):", paymentId);
//
//     if (resultCode !== "Success") {
//         console.error("결제 실패 - resultCode:", resultCode, "resultMessage:", resultMessage);
//         return sendError(res, 400, "결제 실패: " + (resultMessage || "알 수 없는 오류"));
//     }
//
//     if (!paymentId) {
//         console.error("paymentId 누락");
//         return sendError(res, 400, "결제 승인에 필요한 paymentId가 누락되었습니다.");
//     }
//
//     let paymentRecord;
//     try {
//         paymentRecord = await Payment.findOne({
//             partner_order_id: merchantPayKey,
//             payStatus: 'pending'
//         });
//         if (!paymentRecord) {
//             console.error("Payment record not found for merchantPayKey:", merchantPayKey);
//             return sendError(res, 404, 'Payment record not found');
//         }
//     } catch (err) {
//         console.error("Payment 조회 오류:", err.message);
//         return sendError(res, 500, "Payment 조회 오류");
//     }
//
//     try {
//         const approvalData = {
//             cid: NAVER_PAY_CID,
//             tid: paymentId,
//             partner_order_id: merchantPayKey,
//             partner_user_id: paymentRecord.userId.toString(),
//             pg_token: pg_token,
//             // idempotencyKey을 별도로 전달할 경우 여기에 포함할 수 있음
//         };
//         console.log("Naver Pay 승인 요청 데이터:", approvalData);
//
//         const approveResponse = await naverPayApproveApi(approvalData);
//         console.log("Naver Pay 승인 응답:", approveResponse.data);
//
//         if (approveResponse.data.code !== "Success") {
//             console.error("승인 API 실패:", approveResponse.data.message);
//             return sendError(res, 400, "승인 API 오류: " + approveResponse.data.message);
//         }
//
//         // 승인 응답에서 detail 정보 추출
//         const detail =
//             approveResponse.data.body && approveResponse.data.body.detail
//                 ? approveResponse.data.body.detail
//                 : approveResponse.data;
//         const updatedPaymentRecord = await updatePaymentRecord(detail, merchantPayKey);
//         console.log("업데이트된 Payment 기록:", updatedPaymentRecord);
//
//         await createPaymentHistoryRecord(updatedPaymentRecord, detail);
//         console.log("PaymentHistory 생성 완료");
//
//         await updateUserPlan(paymentRecord.userId, merchantPayKey);
//         console.log("User plan 업데이트 완료");
//
//         return res.json({ success: true, message: "결제 승인 처리 완료" });
//     } catch (error) {
//         console.error(
//             "NaverPay approve error:",
//             error.response ? error.response.data : error.message
//         );
//         return sendError(res, 500, "결제 승인 처리 중 오류가 발생했습니다.");
//     }
// };
//
// export const naverPayCancel = (req, res) => {
//     console.log("===== naverPayCancel 호출 =====");
//     console.log("요청 쿼리:", req.query);
//     return res.json({ success: false, message: "네이버 페이 결제 취소 기능 미구현" });
// };
//
// export const naverPayFail = (req, res) => {
//     console.log("===== naverPayFail 호출 =====");
//     console.log("요청 쿼리:", req.query);
//     return res.json({ success: false, message: "결제 실패 처리" });
// };
