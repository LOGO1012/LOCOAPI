// 파일 경로: src/controllers/naverAuthController.js
// 네이버 OAuth 콜백 요청을 처리하여 사용자 정보를 조회하고, 로그인 또는 회원가입 필요 상태를 반환합니다.
import { naverAuthSchema } from '../dto/naverAuthValidator.js';
import { naverLogin, deleteNaverToken } from '../services/naverAuthService.js';
import {findUserByNaver, getUserById} from '../services/userService.js'; // 기존 userService.js의 네이버 조회 함수 사용
import { User } from '../models/UserProfile.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const REFRESH_SECRET = process.env.REFRESH_SECRET || "your_refresh_secret";
const isProd = process.env.NODE_ENV === 'production';
const BASE_URL_FRONT = process.env.BASE_URL_FRONT


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

        // DB에서 네이버 사용자를 조회 (토큰도 함께 저장)
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
            .cookie("accessToken",  accessToken,  { ...cookieOptions, maxAge: 15*60*1000 })
            .cookie("refreshToken", refreshToken, { ...cookieOptions, maxAge: 7*24*60*60*1000 })
            .status(200)
            .json({
                message:     "네이버 로그인 성공",
                status:      "success",
                user,
            });
    } catch (err) {
        next(err);
    }
};

// /**
//  * Refresh 토큰으로 새 Access 토큰 발급
//  */
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
//                 naverId: payload.naverId,
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
 */
export const naverRefreshToken = async (req, res) => {
    try {
        const rToken = req.cookies.refreshToken;
        if (!rToken) {
            return res.status(401).json({ message: '리프레시 토큰이 없습니다.' });
        }

        const payload = jwt.verify(rToken, REFRESH_SECRET);
        const user = await getUserById(payload.userId);
        if (!user) {
            return res.status(401).json({ message: '유효하지 않은 사용자입니다.' });
        }

        const newAccessToken = jwt.sign(
            {
                userId: payload.userId,
                naverId: payload.naverId,
                name: payload.name,
            },
            JWT_SECRET,
            { expiresIn: '15m' }
        );
        return res
            .cookie("accessToken", newAccessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 })
            .status(200)
            .json({ message: "Access token refreshed" });
    } catch (err) {
        return res.status(401).json({ message: '리프레시 토큰이 유효하지 않습니다.' });
    }
};

/**
 * 로그아웃: 네이버 토큰 삭제 + 쿠키 삭제
 */
export const logout = async (req, res) => {
    console.log('네이버 로그아웃 요청 시작');
    console.log('현재 쿠키들:', req.cookies);
    
    try {
        // JWT에서 사용자 ID 추출
        const token = req.cookies.accessToken || req.cookies.refreshToken;
        if (token) {
            const payload = jwt.verify(token, token === req.cookies.accessToken ? JWT_SECRET : REFRESH_SECRET);
            const userId = payload.userId;
            
            if (userId) {
                console.log('사용자 ID:', userId, '의 네이버 토큰 삭제 시도');
                
                // 사용자 정보 조회
                const user = await getUserById(userId);
                if (user && user.social && user.social.naver && user.social.naver.accessToken) {
                    console.log('네이버 액세스 토큰 발견, 삭제 API 호출');
                    
                    // 네이버 토큰 삭제 API 호출
                    const deleteResult = await deleteNaverToken(user.social.naver.accessToken);
                    
                    if (deleteResult) {
                        console.log('✅ 네이버 토큰 삭제 성공');
                        
                        // DB에서도 토큰 제거
                        await User.findByIdAndUpdate(userId, {
                            'social.naver.accessToken': ''
                        });
                        console.log('✅ DB에서 네이버 토큰 제거 완료');
                    } else {
                        console.warn('⚠️ 네이버 토큰 삭제 실패 또는 이미 만료됨');
                    }
                } else {
                    console.log('네이버 로그인 사용자가 아니거나 토큰이 없음');
                }
            }
        }
    } catch (err) {
        console.error('로그아웃 중 에러 발생:', err.message);
        // 에러가 발생해도 로그아웃은 계속 진행
    }
    
    // 쿠키 삭제 - 설정할 때와 동일한 옵션 사용
    res.clearCookie('refreshToken', clearCookieOptions);
    res.clearCookie('accessToken', clearCookieOptions);
    
    console.log('쿠키 삭제 완료');
    return res.status(200).json({ message: "Logged out" });
};

/**
 * 로그아웃 후 프론트 리다이렉트용 (카카오/네이버 공통)
 */
export const logoutRedirect = async (req, res) => {
    console.log('소셜 로그아웃 리다이렉트 시작');
    console.log('현재 쿠키들:', req.cookies);
    
    try {
        // JWT에서 사용자 ID 추출
        const token = req.cookies.accessToken || req.cookies.refreshToken;
        if (token) {
            const payload = jwt.verify(token, token === req.cookies.accessToken ? JWT_SECRET : REFRESH_SECRET);
            const userId = payload.userId;
            
            if (userId) {
                console.log('사용자 ID:', userId, '의 네이버 토큰 삭제 시도');
                
                // 사용자 정보 조회
                const user = await getUserById(userId);
                if (user && user.social && user.social.naver && user.social.naver.accessToken) {
                    console.log('네이버 액세스 토큰 발견, 삭제 API 호출');
                    
                    // 네이버 토큰 삭제 API 호출
                    const deleteResult = await deleteNaverToken(user.social.naver.accessToken);
                    
                    if (deleteResult) {
                        console.log('✅ 네이버 토큰 삭제 성공');
                        
                        // DB에서도 토큰 제거
                        await User.findByIdAndUpdate(userId, {
                            'social.naver.accessToken': ''
                        });
                        console.log('✅ DB에서 네이버 토큰 제거 완료');
                    } else {
                        console.warn('⚠️ 네이버 토큰 삭제 실패 또는 이미 만료됨');
                    }
                }
            }
        }
    } catch (err) {
        console.error('로그아웃 리다이렉트 중 에러 발생:', err.message);
        // 에러가 발생해도 로그아웃은 계속 진행
    }
    
    // 세션 정리 (네이버 데이터 포함)
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                console.error('세션 삭제 오류:', err);
            } else {
                console.log('세션 삭제 완료');
            }
        });
    }
    
    // 쿠키 삭제 - 설정할 때와 동일한 옵션 사용
    res.clearCookie('refreshToken', clearCookieOptions);
    res.clearCookie('accessToken', clearCookieOptions);
    res.clearCookie('connect.sid', clearCookieOptions); // 세션 쿠키도 삭제
    
    console.log('쿠키 및 세션 삭제 후 프론트로 리다이렉트');
    return res.redirect(BASE_URL_FRONT);
};
