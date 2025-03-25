// src/controllers/authController.js
// 카카오 인증 요청에서 전달받은 인가코드를 검증하기 위한 Joi 스키마 임포트
import { kakaoAuthSchema } from '../dto/authValidator.js';
import { kakaoLogin } from '../services/authService.js';
import { findUserOrNoUser } from '../services/userService.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config(); // .env 파일에 정의된 환경변수 로드

// JWT 서명에 사용할 비밀키를 환경변수에서 가져오거나 기본값 사용
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

/**
 * 카카오 OAuth 콜백 컨트롤러 함수
 * 1. 카카오에서 전달받은 인가코드를 Joi 스키마로 검증합니다.
 * 2. 인가코드를 바탕으로 카카오 API와 통신해 액세스 토큰과 사용자 정보를 받아옵니다.
 * 3. DB에 카카오 정보가 존재하면 로그인(토큰 발급) 처리, 없으면 회원가입 페이지로 리다이렉트합니다.
 *
 * @param {import('express').Request} req - Express 요청 객체 (쿼리 파라미터에 인가코드 포함)
 * @param {import('express').Response} res - Express 응답 객체
 * @param {Function} next - 에러 핸들링 미들웨어 호출 함수
 */
export const kakaoCallback = async (req, res, next) => {
    try {
        // 인가코드가 포함된 쿼리 파라미터를 로그에 출력
        console.log('카카오 콜백 요청 수신:', req.query);

        // Joi 스키마를 통해 쿼리 파라미터를 검증 (code가 반드시 필요)
        const { error, value } = kakaoAuthSchema.validate(req.query);
        if (error) {
            // 검증 실패 시 에러 로그 출력 후 400 상태 코드 응답
            console.error('DTO 검증 오류:', error.details[0].message);
            return res.status(400).json({ message: error.details[0].message });
        }
        // 검증 성공 시 로그 출력
        console.log('DTO 검증 성공:', value);

        // 검증된 값에서 인가코드를 추출
        const { code } = value;

        // 인가코드를 사용해 카카오 API와 통신, 액세스 토큰 및 사용자 정보 획득
        const kakaoUserData = await kakaoLogin(code);
        console.log('카카오 로그인 서비스 반환:', kakaoUserData);

        // DB에서 해당 카카오 사용자가 이미 존재하는지 확인
        const result = await findUserOrNoUser(kakaoUserData);

        // DB에 사용자 정보가 없다면 회원가입이 필요하므로, 회원가입 페이지로 리다이렉트
        // 카카오 정보를 쿼리 파라미터로 전달하여 회원가입 페이지에서 표시할 수 있도록 함
        if (result.status === 'noUser') {
            console.log('사용자가 존재하지 않음, 회원가입 필요');
            // 회원가입 페이지로 리다이렉트하면서 카카오 정보를 URL 쿼리 파라미터로 전달
            req.session.kakaoUserData = kakaoUserData; //(추가함)
            // return res.redirect(
            //     `http://localhost:5173/signup`
            // );
            console.log("세션에 저장된 데이터:", req.session.kakaoUserData); // (추가) 세션 데이터 확인용 콘솔 로그
            return res.status(200).json({
                message: "회원가입 필요",
                status: "noUser",
                kakaoUserData
            });
        }

        // 이미 등록된 사용자라면, DB에서 해당 사용자 정보를 변수에 저장
        const user = result;
        console.log('DB에서 사용자 처리 결과:', user);




        // JWT 토큰 생성: 사용자 _id, 카카오 id, 이름을 payload로 포함하여 서명
        const token = jwt.sign(
            { userId: user._id, kakaoId: user.social.kakao.providerId, name: user.name },
            JWT_SECRET,
            { expiresIn: '1d' } // 토큰 유효 기간: 1일
        );
        console.log('JWT 토큰 발급 성공:', token);




        res.cookie("token", token, {
            httpOnly: true,
            secure: false,
            // secure: process.env.NODE_ENV === "production", //배포환경에서 변경,
            // sameSite: "lax", //sameSite: "strict"
            sameSite: "none",   // 크로스 사이트 허용
            maxAge: 86400000, // 1일 (밀리초)
        });

        // 로그 추가: 쿠키 설정 정보 출력
        console.log("Set-Cookie header set for 'token' with options:", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "none",   // 크로스 사이트 허용
            // sameSite: "lax",
            maxAge: 86400000,
        });


        // 로그인 성공 응답: JWT 토큰과 사용자 정보를 JSON 형태로 반환
        return res.status(200).json({
            message: '카카오 로그인 성공',
            status: "success",
            user,
            // token
        });
    } catch (err) {
        // 예외 발생 시 에러 메시지를 로그에 출력하고, next()로 에러를 전파
        console.error('카카오 콜백 컨트롤러 에러:', err.message);
        next(err);
    }
};
