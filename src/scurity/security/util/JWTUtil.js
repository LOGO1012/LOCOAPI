import jwt from 'jsonwebtoken';
import moment from 'moment-timezone';

const JWTUtil = {
    key: "1234567890123456789012345678901234567890", // 동일한 비밀키 사용

    /**
     * JWT 생성
     * @param {Object} valueMap - 클레임 데이터
     * @param {number} min - 만료 시간(분)
     * @returns {string} - 생성된 JWT
     */
    createToken(valueMap, min) {
        console.log("createToken ---------");
        console.log("Expiration time in minutes:", min); // min 값 확인

        // 한국 표준시로 시간을 가져옴
        const expiration = moment().tz('Asia/Seoul').add(min, 'minutes').unix(); // KST로 만료 시간 설정
        console.log("Token expiration time (unix):", expiration); // 만료 시간 (unix timestamp) 확인

        const payload = {
            ...valueMap, // 클레임 데이터 추가
            exp: expiration // 만료 시간 설정
        };

        return jwt.sign(payload, this.key, { algorithm: "HS256" }); // 토큰 생성
    },

    /**
     * JWT 검증
     * @param {string} token - 입력받은 JWT 문자열
     * @returns {Object} - 검증된 클레임 데이터
     */
    validateToken(token) {
        console.log("validateToken-----------");
        console.log("Token:", token);
        try {
            const decoded = jwt.verify(token, this.key, { algorithms: ["HS256"] }); // 토큰 검증
            console.log("Decoded Claims:", decoded);

            // 만료 시간을 로그로 출력하여 디버깅
            const expirationTime = moment.unix(decoded.exp).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');
            console.log("Token Expiration Time:", expirationTime);

            // 현재 시간과 만료 시간을 비교
            const currentTime = moment().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');
            console.log("Current Time:", currentTime);

            return decoded;
        } catch (error) {
            console.error("Invalid Token:", error.message);

            if (error.name === "TokenExpiredError") {
                // 만료된 토큰의 만료 시간을 올바르게 출력
                const expiredAt = moment.unix(error.expiredAt).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');
                console.log("Token expired at:", expiredAt);
            }

            throw new Error("Invalid Token");
        }
    }
};

export default JWTUtil;