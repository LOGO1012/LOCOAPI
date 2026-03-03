// src/middlewares/authMiddleware.js
import jwt from 'jsonwebtoken';
import {getUserForAuth} from "../services/userService.js";
import {isBlacklisted} from "../utils/tokenBlacklist.js";

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
            // 블랙리스트 체크 (로그아웃된 토큰 거부)
            if (await isBlacklisted(accessToken)) {
                return res.status(401).json({message: "로그아웃된 토큰입니다."});
            }

            // JWT 토큰 검증
            const payload = jwt.verify(accessToken, process.env.JWT_SECRET);
            // ✅ 최적화: getUserForAuth 사용
            // - 7개 필드만 조회: _id, nickname, email, status, profilePhoto, gender, social, createdAt
            // - .lean() 사용으로 Mongoose 오버헤드 제거
            // - 복호화 로직 없음 (birthdate 등 제외)
            const user = await getUserForAuth(payload.userId);

            // 사용자가 존재하지 않으면 401 반환
            if (!user) {
                return res.status(401).json({message: "유효하지 않은 사용자입니다."});
            }


            // ✅ req.user에 최소한의 정보만 저장
            // - 이후 미들웨어나 컨트롤러에서 req.user._id로 접근 가능
            // - 필요한 추가 정보는 해당 컨트롤러에서 별도 조회
            req.user = user;
            return next();
        } catch {
            // H-02 보안 조치: accessToken 실패 시 바로 401 반환
            // refreshToken은 /api/auth/refresh 전용 (프론트 인터셉터가 자동 재발급 처리)
            return res.status(401).json({message: "액세스 토큰이 만료되었거나 유효하지 않습니다."});
        }
    } catch (err) {
        console.error("authenticate 미들웨어 에러:", err);
        return res.status(500).json({message: "서버 오류"});
    }
};