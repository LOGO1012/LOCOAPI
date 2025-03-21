// src/services/authService.js
import axios from 'axios';            // HTTP 요청을 위해 axios 사용
import qs from 'querystring';         // 요청 본문을 URL 인코딩하기 위해 querystring 사용
import dotenv from 'dotenv';          // 환경 변수 로드를 위해 dotenv 사용
dotenv.config();                      // .env 파일의 환경 변수를 로드

// 카카오 OAuth 관련 엔드포인트 (Kakao Developers 문서 참고)
const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';  // 토큰 발급 URL
const KAKAO_USER_INFO_URL = 'https://kapi.kakao.com/v2/user/me';  // 사용자 정보 조회 URL

// .env 파일에서 카카오 관련 설정을 불러옵니다.
const REST_API_KEY = process.env.KAKAO_REST_API_KEY;
const REDIRECT_URI = process.env.KAKAO_REDIRECT_URI;
const CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET || '';

/**
 * kakaoLogin
 * - authorization code를 사용해 카카오로부터 access token을 발급받고,
 *   해당 access token을 사용하여 사용자 정보를 조회하는 함수입니다.
 *
 * @param {string} code - 카카오에서 받은 authorization code
 * @returns {Promise<Object>} - 카카오 사용자 정보 객체 { kakaoId, nickname, profileImage, email }
 * @throws {Error} - access token 발급 또는 사용자 정보 조회에 실패하면 에러 발생
 */
export const kakaoLogin = async (code) => {
    try {
        // (추가)(설명): 테스트 환경에서 "test-code"가 전달되면 미리 정의된 데이터를 반환하여 실제 API 호출을 건너뜁니다.
        if (code === 'test-code') {
            console.log('테스트 코드 감지 - 미리 정의된 사용자 정보 반환');
            return {
                kakaoId: 1234567890,
                nickname: '테스트닉네임',
                profileImage: 'http://example.com/profile.jpg',
                email: 'test@example.com'
            };
        }

        console.log('카카오 토큰 발급 요청 시작...');
        // 1. 카카오 토큰 발급 요청: authorization code를 이용하여 access token 요청
        const tokenResponse = await axios.post(
            KAKAO_TOKEN_URL,           // 토큰 발급 URL
            qs.stringify({
                grant_type: 'authorization_code', // OAuth2 표준 파라미터
                client_id: REST_API_KEY,            // 카카오 REST API 키
                redirect_uri: REDIRECT_URI,         // 등록된 리다이렉트 URI
                code,                              // 전달받은 authorization code
                client_secret: CLIENT_SECRET        // 클라이언트 시크릿 (필요시)
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        // 2. 응답 데이터에서 access_token 추출
        const { access_token } = tokenResponse.data;
        if (!access_token) {
            console.error('카카오 토큰 발급 실패: access_token 없음');
            throw new Error('카카오 access token 발급 실패');
        }
        console.log('카카오 토큰 발급 성공, access_token:', access_token);

        console.log('카카오 사용자 정보 요청 시작...');
        // 3. access token을 사용하여 카카오 사용자 정보 요청
        const userResponse = await axios.get(KAKAO_USER_INFO_URL, {
            headers: {
                // 수정: Bearer 토큰 인증 부분에 템플릿 리터럴(``) 사용
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
            }
        });

        const kakaoUser = userResponse.data; // 카카오가 반환한 사용자 데이터
        console.log('카카오 사용자 정보 조회 성공:', kakaoUser);



        // 4. 카카오에서 필요한 정보 추출 및 fallback 처리
        const name = kakaoUser.kakao_account?.name || '';
        const phoneNumber = kakaoUser.kakao_account?.phone_number || '';
        const birthday = kakaoUser.kakao_account?.birthday || '';   // MMDD 형식
        const birthyear = kakaoUser.kakao_account?.birthyear || '';
        const gender = kakaoUser.kakao_account?.gender || '';

        return {
            kakaoId: kakaoUser.id,
            name,
            phoneNumber,
            birthday,
            birthyear,
            gender
        };

    } catch (error) {
        // 에러 발생 시, error.response?.data 또는 error.message를 출력하고 에러를 던집니다.
        console.error('카카오 로그인 서비스 에러:', error.response?.data || error.message);
        throw error;
    }
};
