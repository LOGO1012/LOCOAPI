// /src/services/kakaoPayApi.js
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const KAKAO_SECRET_KEY = process.env.KAKAO_SECRET_KEY;
const KAKAO_SUBSCRIPTION_CID = process.env.KAKAO_CID || 'TCSUBSCRIP';

export const kakaoPayReadyApi = async (data) => {
    return axios.post(
        'https://open-api.kakaopay.com/online/v1/payment/ready',
        data,
        {
            headers: {
                'Authorization': `SECRET_KEY ${KAKAO_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        }
    );
};

export const kakaoPaySubscriptionApi = async (data) => {
    return axios.post(
        'https://open-api.kakaopay.com/online/v1/payment/subscription',
        data,
        {
            headers: {
                'Authorization': `SECRET_KEY ${KAKAO_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        }
    );
};

export const kakaoPayApproveApi = async (data) => {
    return axios.post(
        'https://open-api.kakaopay.com/online/v1/payment/approve',
        data,
        {
            headers: {
                'Authorization': `SECRET_KEY ${KAKAO_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        }
    );
};


