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
            gender : naverUser.gender,
            access_token // 토큰 삭제를 위해 access_token도 반환
        };
    } catch (error) {
        console.error('네이버 로그인 서비스 에러:', error.response?.data || error.message);
        throw error;
    }
};

// 네이버 토큰 삭제 (연동해제) 기능 추가
export const deleteNaverToken = async (accessToken) => {
    try {
        console.log('=== 네이버 토큰 삭제 시작 ===');
        console.log('삭제할 액세스 토큰:', accessToken ? '존재함' : '없음');
        console.log('토큰 길이:', accessToken ? accessToken.length : 0);
        
        if (!accessToken) {
            console.error('액세스 토큰이 없어서 삭제 불가');
            return false;
        }
        
        // 네이버 토큰 삭제 API 호출
        const deleteUrl = 'https://nid.naver.com/oauth2.0/token';
        const params = {
            grant_type: 'delete',
            client_id: process.env.NAVER_CLIENT_ID,
            client_secret: process.env.NAVER_CLIENT_SECRET,
            access_token: encodeURIComponent(accessToken), // URL 인코딩 필수
            service_provider: 'NAVER'
        };
        
        console.log('네이버 토큰 삭제 API 호출 중...');
        console.log('요청 URL:', deleteUrl);
        console.log('요청 파라미터:', { ...params, access_token: '[HIDDEN]' });
        
        const response = await axios.get(deleteUrl, { params });
        
        console.log('네이버 토큰 삭제 응답 상태:', response.status);
        console.log('네이버 토큰 삭제 응답 데이터:', response.data);
        
        // 결과가 success인지 확인
        if (response.data.result === 'success') {
            console.log('✅ 네이버 토큰 삭제 성공!');
            return true;
        } else {
            console.warn('⚠️ 네이버 토큰 삭제 결과가 success가 아님:', response.data);
            return false;
        }
    } catch (error) {
        console.error('❌ 네이버 토큰 삭제 에러:');
        console.error('에러 메시지:', error.message);
        console.error('에러 응답:', error.response?.data);
        console.error('에러 상태 코드:', error.response?.status);
        return false; // 에러 발생 시 false 반환
    }
};
