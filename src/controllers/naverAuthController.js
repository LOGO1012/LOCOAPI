// 파일 경로: src/controllers/naverAuthController.js
// 네이버 OAuth 콜백 요청을 처리하여 사용자 정보를 조회하고, 로그인 또는 회원가입 필요 상태를 반환합니다.
import { naverAuthSchema } from '../dto/naverAuthValidator.js';
import { naverLogin } from '../services/naverAuthService.js';
import { findUserByNaver } from '../services/userService.js'; // 기존 userService.js의 네이버 조회 함수 사용
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

export const naverCallback = async (req, res, next) => {
    try {
        console.log('네이버 콜백 요청 수신:', req.query);
        const { error, value } = naverAuthSchema.validate(req.query);
        if (error) {
            console.error('네이버 DTO 검증 오류:', error.details[0].message);
            return res.status(400).json({ message: error.details[0].message });
        }
        console.log('네이버 DTO 검증 성공:', value);
        const { code, state } = value;

        // 네이버 로그인 서비스 호출
        const naverUserData = await naverLogin(code, state);
        console.log('네이버 로그인 서비스 반환:', naverUserData);

        // DB에서 네이버 사용자를 조회
        const result = await findUserByNaver(naverUserData);
        if (result.status === 'noUser') {
            console.log('네이버 사용자가 존재하지 않음, 회원가입 필요');
            req.session.naverUserData = naverUserData;
            console.log("세션에 저장된 네이버 데이터:", req.session.naverUserData);
            return res.status(200).json({
                message: "회원가입 필요",
                status: "noUser",
                naverUserData
            });
        }
        const user = result;
        console.log('DB에서 네이버 사용자 처리 결과:', user);

        // JWT 토큰 발급
        const token = jwt.sign(
            { userId: user._id, naverId: user.social.naver.providerId, name: user.name },
            JWT_SECRET,
            { expiresIn: '1d' }
        );
        console.log('JWT 토큰 발급 성공:', token);

        res.cookie("token", token, {
            httpOnly: true,
            secure: false,
            // secure: process.env.NODE_ENV === "production",
            // sameSite: "none",   // 크로스 사이트 허용
            sameSite: "lax",
            // sameSite: "strict",
            maxAge: 86400000, // 1일
        });

        // 로그 추가
        console.log("Set-Cookie header set for 'token' with options:", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            // sameSite: "none",   // 크로스 사이트 허용
            maxAge: 86400000,
        });


        return res.status(200).json({
            message: '네이버 로그인 성공',
            status: "success",
            user,
            // token
        });
    } catch (err) {
        console.error('네이버 콜백 컨트롤러 에러:', err.message);
        next(err);
    }
};
