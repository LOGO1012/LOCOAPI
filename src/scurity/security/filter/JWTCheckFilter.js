import CustomUserPrincipal from "../auth/CustomUserPrincipal.js";
import JWTUtil from "../util/JWTUtil.js";

/**
 * JWT 검증 미들웨어
 * @param {string[]} excludedPaths - JWT 검증을 제외할 경로
 * @param {string} secretKey - JWT 비밀키
 * @returns Express 미들웨어 함수
 */
const JWTCheckFilter = (excludedPaths) => {

    console.log("checkFilter ----------- 1")
    return (req, res, next) => {
        const requestPath = req.path;

        // 1. JWT 검증 제외 경로
        if (excludedPaths.some((path) => requestPath.startsWith(path))) {
            console.log("Skipping JWT validation for path:", requestPath);
            return next();
        }

        // 2. Authorization 헤더 확인
        const authHeader = req.headers["authorization"];
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            console.log("No Authorization header or invalid format");
            return res.status(401).json({ status: 401, msg: "No Access Token" });
        }

        // 3. 토큰 추출
        const token = authHeader.substring(7); // "Bearer " 이후의 문자열

        try {
            // 4. JWTUtil.validateToken을 사용하여 토큰 검증
            const claims = JWTUtil.validateToken(token); // validateToken에서 검증된 클레임 반환
            console.log("Claims:", claims);

            // 5. 사용자 정보 설정 (email)
            const userPrincipal = new CustomUserPrincipal(claims.email); // CustomUserPrincipal로 사용자 설정

            // 6. req.user에 CustomUserPrincipal 객체 할당
            req.user = userPrincipal;

            // 7. 다음 미들웨어로 이동
            next();
        } catch (err) {
            console.error("JWT validation error:", err.name, err.message);
            return res.status(401).json({ status: 401, msg: err.message });
        }
    };
};

export default JWTCheckFilter;