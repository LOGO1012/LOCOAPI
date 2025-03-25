// src/services/naverPayApi.js
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

// 네이버페이 결제 준비 API 호출
export const naverPayReadyApi = async (data) => {
    return axios.post(
        'https://api.naver.com/payments/ready',  // 실제 네이버페이 API URL (네이버 문서 참고)
        data,
        {
            headers: {
                'X-Naver-Client-Id': NAVER_CLIENT_ID,
                'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
                'Content-Type': 'application/json'
            }
        }
    );
};

// 네이버페이 결제 승인 API 호출
export const naverPayApproveApi = async (data) => {
    return axios.post(
        'https://api.naver.com/payments/approve',  // 실제 네이버페이 승인 API URL (네이버 문서 참고)
        data,
        {
            headers: {
                'X-Naver-Client-Id': NAVER_CLIENT_ID,
                'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
                'Content-Type': 'application/json'
            }
        }
    );
};
