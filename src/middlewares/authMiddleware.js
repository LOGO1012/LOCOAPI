// src/middlewares/authMiddleware.js
import jwt from 'jsonwebtoken';
import { User } from '../models/UserProfile.js';  // User 모델 임포트

export const authenticate = async (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ message: "토큰이 존재하지 않습니다." });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // DB에서 userLv을 포함한 사용자 정보 조회
        const user = await User.findById(decoded.userId)
            .select('userLv')
            .lean();
        if (!user) {
            return res.status(401).json({ message: "유효하지 않은 사용자입니다." });
        }
        req.user = user;  // { _id, userLv } 형태로 저장
        next();
    } catch (err) {
        return res.status(401).json({ message: "유효하지 않은 토큰입니다." });
    }
};
