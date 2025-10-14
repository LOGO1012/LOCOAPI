// src/middlewares/requireLevel.js

/**
 * 최소 레벨 미만이면 403 Forbidden 리턴
 * @param {number} minLevel - 허용할 최소 userLv
 */
export const requireLevel = (minLevel) => {
    return (req, res, next) => {
        // req.user는 authenticate 미들웨어에서 채워진다고 가정
        if (!req.user || req.user.userLv < minLevel) {
            return res.status(403).json({ message: '접근 권한이 없습니다.' });
        }
        next();
    };
};

