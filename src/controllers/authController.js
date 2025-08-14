// src/controllers/authController.js
// 카카오 인증 요청에서 전달받은 인가코드를 검증하기 위한 Joi 스키마 임포트
import { kakaoAuthSchema } from '../dto/authValidator.js';
import { kakaoLogin } from '../services/authService.js';
import {findUserOrNoUser, getUserById} from '../services/userService.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config(); // .env 파일에 정의된 환경변수 로드

// JWT 서명에 사용할 비밀키를 환경변수에서 가져오거나 기본값 사용
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const REFRESH_SECRET = process.env.REFRESH_SECRET || "your_refresh_secret";
const BASE_URL_FRONT = process.env.BASE_URL_FRONT
const isProd = process.env.NODE_ENV === 'production';

const cookieOptions = {
    httpOnly: true,
    secure:   false,  // 개발환경에서는 false
    sameSite: 'lax',  // 개발환경에서는 lax
    path:     "/",
    // domain 옵션을 제거하여 현재 도메인에만 쿠키 설정
    maxAge:   7 * 24 * 60 * 60 * 1000,
};

// 쿠키 삭제용 옵션 (maxAge 없이, 설정 시와 동일한 옵션 사용)
const clearCookieOptions = {
    httpOnly: true,
    secure:   false,  // 설정할 때와 동일하게
    sameSite: 'lax',  // 설정할 때와 동일하게
    path:     "/",
    // domain 옵션 제거
};

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

        const payload = {
            userId:  user._id,
            kakaoId: user.social.kakao.providerId,
            name:    user.name,
        };

        const accessToken  = jwt.sign(payload, JWT_SECRET,     { expiresIn: "2h" }); // 15분 → 2시간으로 연장
        const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: "7d" });



        // 5) Refresh 토큰은 HttpOnly 쿠키로, Access 토큰은 JSON 바디로 응답
        // 수정 Refresh, Access 둘다 HttpOnly 쿠키로
        res
            .cookie('accessToken',  accessToken,  { ...cookieOptions, maxAge: 2 * 60 * 60 * 1000}) // 2시간
            .cookie('refreshToken', refreshToken, { ...cookieOptions , maxAge: 7*24*60*60*1000 })
            .json({
                message:     "카카오 로그인 성공",
                status:      "success",
                user,
            });
    } catch (err) {
        next(err);
    }
};                                                    // 원본 소셜 로그인 부분 참조 :contentReference[oaicite:0]{index=0}
//---------------------카카오 콜백

/**
 * Refresh 토큰으로 새 Access 토큰 발급
 */
// export const refreshToken = (req, res) => {
//     const token = req.cookies.refreshToken;
//     if (!token) {
//         return res.status(401).json({ message: "No refresh token" });
//     }
//     try {
//         const payload = jwt.verify(token, REFRESH_SECRET);
//         const newAccess = jwt.sign(
//             {
//                 userId:  payload.userId,
//                 kakaoId: payload.kakaoId,
//                 name:    payload.name,
//             },
//             JWT_SECRET,
//             { expiresIn: "15m" }
//         );
//         return res.json({ accessToken: newAccess });
//     } catch {
//         return res.status(401).json({ message: "Invalid refresh token" });
//     }
// };

/**
 * 리프레시 토큰으로 새 액세스 토큰 발급
 * 1) 쿠키에 담긴 리프레시 토큰이 없는 경우 → 401
 * 2) 토큰 검증 후 DB에서 해당 userId가 실제 존재하는지 확인 → 없으면 401
 * 3) 새 액세스 토큰 발급 → { accessToken } 반환
 */
export const refreshToken = async (req, res) => {
    try {
        const rToken = req.cookies.refreshToken;
        if (!rToken) {
            return res.status(401).json({ message: '리프레시 토큰이 없습니다.' });
        }

        const payload = jwt.verify(rToken, REFRESH_SECRET);
        // DB에 실제 userId 존재 여부 확인
        const user = await getUserById(payload.userId);
        if (!user) {
            return res.status(401).json({ message: '유효하지 않은 사용자입니다.' });
        }

        // 새 액세스 토큰 발급
        const newAccessToken = jwt.sign(
            {
                userId: payload.userId,
                kakaoId: payload.kakaoId,
                name: payload.name,
            },
            JWT_SECRET,
            { expiresIn: '2h' } // 15분 → 2시간으로 연장
        );
        return res
            .cookie('accessToken', newAccessToken, { ...cookieOptions, maxAge: 2 * 60 * 60 * 1000 }) // 2시간
            .status(200)
            .json({ message: 'Access token refreshed' });
    } catch (err) {
        return res.status(401).json({ message: '리프레시 토큰이 유효하지 않습니다.' });
    }
};

/**
 * 현재 로그인된 사용자 정보 조회 (/api/auth/me)
 * 1) 헤더에서 Authorization: Bearer <accessToken> 확인 → 검증 → DB 조회 → { user } 반환
 * 2) 헤더 토큰이 만료되었거나 없으면, 쿠키에서 리프레시 토큰으로 검증 → DB 조회 → 새 액세스 토큰 발급 + { user, accessToken } 반환
 * 3) 둘 다 실패 시 401 반환
 */
export const getCurrentUser = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const payload = jwt.verify(token, JWT_SECRET);
                const user = await getUserById(payload.userId);
                if (!user) {
                    return res.status(401).json({ message: '유효하지 않은 사용자입니다.' });
                }
                return res.status(200).json({ user });
            } catch {
                // 액세스 토큰이 만료되었거나 유효하지 않으면, 쿠키 단계로 이동
            }
        }

        // 2) 쿠키 단에서 리프레시 토큰 검사
        const rToken = req.cookies.refreshToken;
        if (!rToken) {
            return res.status(401).json({ message: '리프레시 토큰이 없습니다.' });
        }
        let payload;
        try {
            payload = jwt.verify(rToken, REFRESH_SECRET);
        } catch {
            return res.status(401).json({ message: '리프레시 토큰이 유효하지 않습니다.' });
        }

        const user = await getUserById(payload.userId);
        if (!user) {
            return res.status(401).json({ message: '유효하지 않은 사용자입니다.' });
        }

        // 새로운 액세스 토큰 발급
        const newAccessToken = jwt.sign(
            {
                userId: payload.userId,
                kakaoId: payload.kakaoId,
                name: payload.name,
            },
            JWT_SECRET,
            { expiresIn: '2h' } // 15분 → 2시간으로 연장
        );

        return res
            .cookie('accessToken', newAccessToken, { ...cookieOptions, maxAge: 2 * 60 * 60 * 1000 }) // 2시간
            .status(200)
            .json({ user });
    } catch (err) {
        console.error('GET /api/auth/me 에러:', err);
        return res.status(500).json({ message: '서버 오류' });
    }
};



/**
 * 로그아웃: Refresh 토큰 쿠키 삭제
 */
export const logout = (req, res) => {
    console.log('로그아웃 요청 - 쿠키 삭제 시작');
    console.log('현재 쿠키들:', req.cookies);
    console.log('요청 헤더 Origin:', req.headers.origin);
    console.log('요청 헤더 Host:', req.headers.host);
    
    // 쿠키 삭제 - 설정할 때와 동일한 옵션 사용
    res.clearCookie('refreshToken', clearCookieOptions);
    res.clearCookie('accessToken', clearCookieOptions);
    
    console.log('쿠키 삭제 완료');
    return res.status(200).json({ message: "Logged out" });
};


/**
 * 로그아웃 후 프론트 리다이렉트 (카카오 로그아웃용)
 */
export const logoutRedirect = (req, res) => {
    console.log('로그아웃 리다이렉트 - 쿠키 삭제 시작');
    console.log('현재 쿠키들:', req.cookies);
    
    // 쿠키 삭제 - 설정할 때와 동일한 옵션 사용
    res.clearCookie('refreshToken', clearCookieOptions);
    res.clearCookie('accessToken', clearCookieOptions);
    
    console.log('쿠키 삭제 후 프론트로 리다이렉트');
    return res.redirect(BASE_URL_FRONT);
};