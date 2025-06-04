// src/middlewares/authMiddleware.js
import jwt from 'jsonwebtoken';
import { getUserById } from "../services/userService.js";

export const authenticate = async (req, res, next) => {
    try {
        let token = null;
        const authHeader = req.headers.authorization;

        // 1) Authorization 헤더에서 액세스 토큰 추출
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }

        // 2) 헤더에 액세스 토큰이 없으면, 쿠키에서 리프레시 토큰 사용
        if (!token) {
            token = req.cookies.refreshToken;
        }

        if (!token) {
            return res.status(401).json({ message: "토큰이 제공되지 않았습니다." });
        }

        // 3) 액세스 토큰 검증 시도
        try {
            const payload = jwt.verify(token, process.env.JWT_SECRET);
            const user = await getUserById(payload.userId);
            if (!user) {
                return res.status(401).json({ message: "유효하지 않은 사용자입니다." });
            }
            req.user = user;
            return next();
        } catch {
            // 액세스 토큰이 만료되었거나 위조된 경우, 아래 리프레시 단계로 넘어감
        }

        // 4) 리프레시 토큰 검증
        try {
            const payload = jwt.verify(token, process.env.REFRESH_SECRET);
            const user = await getUserById(payload.userId);
            if (!user) {
                return res.status(401).json({ message: "유효하지 않은 사용자입니다." });
            }
            req.user = user;
            return next();
        } catch {
            return res.status(401).json({ message: "토큰 검증에 실패했습니다." });
        }
    } catch (err) {
        console.error("authenticate 미들웨어 에러:", err);
        return res.status(500).json({ message: "서버 오류" });
    }
};
