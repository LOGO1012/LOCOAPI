// 파일 경로: src/controllers/naverAuthController.js
// 네이버 OAuth 콜백 요청을 처리하여 사용자 정보를 조회하고, 로그인 또는 회원가입 필요 상태를 반환합니다.
import { naverAuthSchema } from '../dto/naverAuthValidator.js';
import { naverLogin } from '../services/naverAuthService.js';
import { findUserByNaver } from '../services/userService.js'; // 기존 userService.js의 네이버 조회 함수 사용
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const REFRESH_SECRET = process.env.REFRESH_SECRET || "your_refresh_secret";

const cookieOptions = {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",                     // prod일 때만 true
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",    // prod → none, dev → lax
    path:     "/api/auth/refresh",
    maxAge:   7 * 24 * 60 * 60 * 1000,
};

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

        const payload = {
            userId:   user._id,
            naverId:  user.social.naver.providerId,
            name:     user.name,
        };



        // 5) 토큰 발급
        const accessToken  = jwt.sign(payload, JWT_SECRET,     { expiresIn: "15m" });
        const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: "7d" });





        // 6) Refresh 토큰은 HttpOnly 쿠키로, Access 토큰은 JSON으로 응답
        res
            .cookie("refreshToken", refreshToken, cookieOptions)
            .status(200)
            .json({
                message:     "네이버 로그인 성공",
                status:      "success",
                accessToken,  // 클라이언트는 메모리에 저장
                user,
            });
    } catch (err) {
        next(err);
    }
};

/**
 * Refresh 토큰으로 새 Access 토큰 발급
 */
export const refreshToken = (req, res) => {
    const token = req.cookies.refreshToken;
    if (!token) {
        return res.status(401).json({ message: "No refresh token" });
    }
    try {
        const payload = jwt.verify(token, REFRESH_SECRET);
        const newAccess = jwt.sign(
            {
                userId:  payload.userId,
                naverId: payload.naverId,
                name:    payload.name,
            },
            JWT_SECRET,
            { expiresIn: "15m" }
        );
        return res.json({ accessToken: newAccess });
    } catch {
        return res.status(401).json({ message: "Invalid refresh token" });
    }
};

/**
 * 로그아웃: Refresh 토큰 쿠키 삭제
 */
export const logout = (req, res) => {
    res.clearCookie("refreshToken", cookieOptions );
    return res.status(200).json({ message: "Logged out" });
};

/**
 * 로그아웃 후 프론트 리다이렉트용 (필요 시)
 */
export const logoutRedirect = (req, res) => {
    res.clearCookie("refreshToken", {
        httpOnly: true,
        secure:   process.env.NODE_ENV === "production",
        sameSite: "none",
        path:     "/api/auth/refresh",
    });
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return res.redirect(frontendUrl);
};
