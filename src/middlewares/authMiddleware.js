// src/middlewares/authMiddleware.js
import jwt from 'jsonwebtoken';
import {getUserById} from "../services/userService.js";

export const authenticate = async (req, res, next) => {
    try {
        // 1) 우선 Authorization 헤더 (Bearer)
        const authHeader = req.headers.authorization;
        let accessToken = authHeader?.startsWith("Bearer ")
            ? authHeader.split(" ")[1]
            : null;

        // 2) 헤더에 없으면, accessToken 쿠키로 시도
        if (!accessToken && req.cookies.accessToken) {
            accessToken = req.cookies.accessToken;
        }

        if (!accessToken) {
            return res.status(401).json({message: "액세스 토큰이 제공되지 않았습니다."});
        }

        // 3) 액세스 토큰 검증 시도
        try {
            const payload = jwt.verify(accessToken, process.env.JWT_SECRET);
            const user = await getUserById(payload.userId);
            if (!user) {
                return res.status(401).json({message: "유효하지 않은 사용자입니다."});
            }
            req.user = user;
            return next();
        } catch {
            // 액세스 토큰이 만료되었거나 위조된 경우, 리프레시 단계로 넘어갑니다.
        }

        // 4) refreshToken 쿠키로 재발급 및 검증
        // 4) refreshToken 쿠키로 재발급 및 검증
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({message: "리프레시 토큰이 제공되지 않았습니다."});
        }
        try {
            const payload = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
            const user = await getUserById(payload.userId);
            if (!user) {
                return res.status(401).json({message: "유효하지 않은 사용자입니다."});
            }
            req.user = user;
            return next();
        } catch {
            return res.status(401).json({message: "리프레시 토큰 검증에 실패했습니다."});
        }
    } catch (err) {
        console.error("authenticate 미들웨어 에러:", err);
        return res.status(500).json({message: "서버 오류"});
    }
};