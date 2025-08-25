// 파일 경로: src/services/naverAuthService.js
// 네이버 로그인 토큰 발급 및 사용자 정보 요청을 처리하는 서비스입니다.
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export const naverLogin = async (code, state) => {
    try {
        // 테스트용 코드 처리
        if (code === 'test-code') {
            console.log('테스트 코드 감지 - 미리 정의된 네이버 사용자 정보 반환');
            return {
                naverId: 'test_naver_id',
                name: '테스트네이버',
                email: 'naver_test@example.com'
            };
        }

        console.log('네이버 토큰 발급 요청 시작...');
        // 네이버 토큰 발급 요청 (GET 방식)
        const tokenResponse = await axios.get('https://nid.naver.com/oauth2.0/token', {
            params: {
                grant_type: 'authorization_code',
                client_id: process.env.NAVER_CLIENT_ID,
                client_secret: process.env.NAVER_CLIENT_SECRET,
                code,
                state
            }
        });

        const { access_token } = tokenResponse.data;
        if (!access_token) {
            console.error('네이버 토큰 발급 실패: access_token 없음');
            throw new Error('네이버 access token 발급 실패');
        }
        console.log('네이버 토큰 발급 성공, access_token:', access_token);

        console.log('네이버 사용자 정보 요청 시작...');
        // 네이버 사용자 정보 요청
        const userResponse = await axios.get('https://openapi.naver.com/v1/nid/me', {
            headers: {
                'Authorization': `Bearer ${access_token}`
            }
        });
        const naverUser = userResponse.data.response;
        console.log('네이버 사용자 정보 조회 성공:', naverUser);

        // 필요한 정보 매핑 – 추가 필드가 있으면 확장 가능
        return {
            naverId: naverUser.id,
            name: naverUser.name,
            phoneNumber: naverUser.mobile,
            birthday : naverUser.birthday,
            birthyear : naverUser.birthyear,
            gender : naverUser.gender

        };
    } catch (error) {
        console.error('네이버 로그인 서비스 에러:', error.response?.data || error.message);
        throw error;
    }
};
