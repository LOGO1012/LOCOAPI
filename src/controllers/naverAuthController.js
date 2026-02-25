// 파일 경로: src/controllers/naverAuthController.js
// 네이버 OAuth 콜백 요청을 처리하여 사용자 정보를 조회하고, 로그인 또는 회원가입 필요 상태를 반환합니다.
import { naverAuthSchema } from '../dto/naverAuthValidator.js';
import { naverLogin, revokeNaverToken } from '../services/naverAuthService.js';
import { findUserByNaver, getUserForAuth, updateUserNaverToken } from '../services/userService.js'; // ✅ updateUserNaverToken 추가
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { checkAndLogAccess } from '../utils/logUtils.js';
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

/**
 * @function naverCallback
 * @description 네이버 OAuth 콜백 요청을 처리합니다.
 *              네이버 사용자 정보를 조회하고 DB와 대조하여 로그인, 회원가입, 또는 재활성화 상태를 반환합니다.
 *              - 탈퇴 후 기간이 만료된 계정은 자동 보관(archiveUserData) 처리됩니다.
 *              - 재활성화 가능 기간인 경우 reactivation_possible 상태를 반환합니다.
 */
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
        if (result.status === 'noUser' || result.status === 'new_registration_required') {
            const statusMsg = result.status === 'noUser' ? '네이버 사용자가 존재하지 않음' : '보관된 사용자';
            console.log(`${statusMsg}, 신규 회원가입 필요`);

            let sessionSocialData; // Declare a mutable variable

            if (result.status === 'new_registration_required' && result.social) {
                // Transform the nested social object from ArchivedUser into a flat structure
                const archivedNaverData = result.social.naver;
                if (archivedNaverData) {
                    sessionSocialData = {
                        naverId: archivedNaverData.providerId,
                        name: archivedNaverData.name,
                        phoneNumber: archivedNaverData.phoneNumber,
                        birthday: archivedNaverData.birthday,
                        birthyear: archivedNaverData.birthyear,
                        gender: archivedNaverData.gender,
                        accessToken: archivedNaverData.accessToken // Include accessToken if needed
                    };
                } else {
                    // Fallback if Naver data is somehow missing from archived social
                    sessionSocialData = naverUserData;
                }
            } else {
                // For 'noUser' case, use the original naverUserData
                sessionSocialData = naverUserData;
            }

            req.session.naverUserData = sessionSocialData; // Save to session
            if (result.deactivationCount) {
                req.session.deactivationCount = result.deactivationCount;
            }
            
            return res.status(200).json({
                message: "신규 회원가입이 필요합니다.",
                status: "new_registration_required",
                socialData: sessionSocialData // Send the normalized data to frontend too
            });
        } else if (result.status === 'reactivation_possible') {
            console.log('탈퇴한 사용자, 재활성화 필요');
            return res.status(200).json({
                message: "계정 재활성화 필요",
                status: "reactivation_possible",
                user: result.user,
                socialData: naverUserData
            });
        }
        const user = result;
        console.log('DB에서 네이버 사용자 처리 결과:', user);

        const clientUser = {
            // ✅ 필수 필드 (인증 및 기본 정보)
            _id: user._id.toString(),       // ✅ ObjectId를 문자열로 변환
            nickname: user.nickname,        // 닉네임
            profilePhoto: user.profilePhoto,// 프로필 사진
            gender: user.gender,            // 성별
            status: user.status,            // 계정 상태
            userLv: user.userLv,            // ⚠️ 중요! 관리자/개발자 메뉴 표시용
            createdAt: user.createdAt,      // 가입일

            // 🚨 누락되어 있던 필수 필드들! (즉시 추가 필요)
            friendReqEnabled: user.friendReqEnabled ?? true,    // 친구 요청 수신 설정
            chatPreviewEnabled: user.chatPreviewEnabled ?? true, // 채팅 미리보기 설정
            wordFilterEnabled: user.wordFilterEnabled ?? true,   // 욕설 필터 설정

            // ✅ 나이 정보 (있으면 포함) - 🔧 birthdate 추가!
            birthdate: user.birthdate,          // 생년월일 (암호화된 상태)
            calculatedAge: user.calculatedAge,  // 만나이
            ageGroup: user.ageGroup,            // 연령대
            isMinor: user.isMinor,               // 미성년자 여부

            // ✅ 추가: 채팅 정보
            numOfChat: user.numOfChat,
            maxChatCount: user.maxChatCount,
            nextRefillAt: user.nextRefillAt
        };

        // ✅ 네이버 access_token을 사용자 정보에 저장
        try {
            await updateUserNaverToken(user._id, naverUserData.accessToken);
            console.log('네이버 access_token 저장 성공');
        } catch (error) {
            console.error('네이버 access_token 저장 실패:', error);
            // 토큰 저장 실패해도 로그인은 진행
        }

        const payload = {
            userId:   user._id,
            naverId:  user.social.naver.providerId,
            name:     user.name,
        };



        // 5) 토큰 발급
        const accessToken  = jwt.sign(payload, JWT_SECRET,     { expiresIn: "15m" });
        const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: "7d" });

        // ✅ 🆕 추가: 네이버 로그인 로그 기록
        checkAndLogAccess(
            user._id.toString(),
            req.ip,
            'login',
            req.headers['user-agent']
        ).catch(err => {
            console.error('로그 저장 실패 (무시):', err);
        });

        // 6) Refresh 토큰은 HttpOnly 쿠키로, Access 토큰은 JSON으로 응답
        res
            .cookie("accessToken",  accessToken,  { ...cookieOptions, maxAge: 15*60*1000 })
            .cookie("refreshToken", refreshToken, { ...cookieOptions, maxAge: 7*24*60*60*1000 })
            .status(200)
            .json({
                message:     "네이버 로그인 성공",
                status:      "success",
                user:        clientUser,
            });
    } catch (err) {
        console.error('네이버 콜백 처리 중 오류:', err);
        
        // ✅ 🆕 추가: 로그인 실패 로그 기록
        checkAndLogAccess(
            null,
            req.ip,
            'login',
            req.headers['user-agent'],
            'fail'
        ).catch(logErr => {
            console.error('실패 로그 저장 실패 (무시):', logErr);
        });

        res.status(400).json({ success: false, message: err.message });
    }
};


/**
 * 리프레시 토큰으로 새 액세스 토큰 발급
 */
export const naverRefreshToken = async (req, res) => {
    try {
        const rToken = req.cookies.refreshToken;
        if (!rToken) {
            res.clearCookie('accessToken', clearCookieOptions);
            return res.status(401).json({ message: '리프레시 토큰이 없습니다.' });
        }

        const payload = jwt.verify(rToken, REFRESH_SECRET);
        const user = await getUserForAuth(payload.userId);
        if (!user) {
            return res.status(401).json({ message: '유효하지 않은 사용자입니다.' });
        }

        // ✅ 🆕 추가: 토큰 리프레시 로그
        checkAndLogAccess(
            payload.userId,
            req.ip,
            'token_refresh',
            req.headers['user-agent']
        ).catch(err => {
            console.error('로그 저장 실패 (무시):', err);
        });

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
        res.clearCookie('refreshToken', clearCookieOptions);
        res.clearCookie('accessToken', clearCookieOptions);
        return res.status(401).json({ message: '리프레시 토큰이 유효하지 않습니다.' });
    }
};

/**
 * ✅ 네이버 연동해제 포함 로그아웃 처리
 */
export const logout = async (req, res) => {
    try {
        console.log('네이버 로그아웃 요청 - 연동해제 및 쿠키 삭제 시작');
        console.log('현재 쿠키들:', req.cookies);
        
        // JWT 토큰에서 사용자 ID 추출
        const token = req.cookies.accessToken || req.cookies.refreshToken;
        if (token) {
            try {
                // 토큰 디코딩해서 사용자 ID 획득
                const decoded = jwt.decode(token);
                if (decoded && decoded.userId) {
                    console.log('사용자 ID 추출 성공:', decoded.userId);
                    
                    // ✅ 🆕 추가: 로그아웃 로그 기록 (네이버 연동해제 전에)
                    await checkAndLogAccess(
                        decoded.userId,
                        req.ip,
                        'logout',
                        req.headers['user-agent']
                    ).catch(err => {
                        console.error('로그 저장 실패 (무시):', err);
                    });
                    
                    // 사용자 정보 조회하여 네이버 access_token 획득
                    const user = await getUserForAuth(decoded.userId);
                    if (user && user.social && user.social.naver && user.social.naver.accessToken) {
                        console.log('네이버 access_token 발견, 연동해제 시도');
                        
                        try {
                            // 네이버 연동해제 API 호출
                            await revokeNaverToken(user.social.naver.accessToken);
                            console.log('네이버 연동해제 성공');
                            
                            // DB에서 네이버 토큰 삭제
                            await updateUserNaverToken(decoded.userId, null);
                            console.log('DB에서 네이버 토큰 삭제 완료');
                        } catch (error) {
                            console.error('네이버 연동해제 실패 (계속 진행):', error.message);
                            // 연동해제 실패해도 로그아웃은 계속 진행
                        }
                    } else {
                        console.log('네이버 access_token이 없음 (카카오 로그인 또는 토큰 없음)');
                    }
                }
            } catch (error) {
                console.error('토큰 디코딩 실패 (계속 진행):', error.message);
            }
        }
        
        // 쿠키 삭제 - 설정할 때와 동일한 옵션 사용
        res.clearCookie('refreshToken', clearCookieOptions);
        res.clearCookie('accessToken', clearCookieOptions);
        
        console.log('로그아웃 처리 완료');
        return res.status(200).json({ 
            message: "로그아웃 완료", 
            naverRevoked: true 
        });
    } catch (error) {
        console.error('로그아웃 처리 중 오류:', error);
        // 오류가 발생해도 쿠키는 삭제
        res.clearCookie('refreshToken', clearCookieOptions);
        res.clearCookie('accessToken', clearCookieOptions);
        return res.status(200).json({ 
            message: "로그아웃 완료 (일부 오류 발생)", 
            error: error.message 
        });
    }
};

/**
 * 로그아웃 후 프론트 리다이렉트용 (필요 시)
 */
export const logoutRedirect = async (req, res) => {
    try {
        console.log('네이버 로그아웃 리다이렉트 - 연동해제 및 쿠키 삭제 시작');
        console.log('현재 쿠키들:', req.cookies);
        
        // logout 함수와 동일한 로직으로 연동해제 처리
        const token = req.cookies.accessToken || req.cookies.refreshToken;
        if (token) {
            try {
                const decoded = jwt.decode(token);
                if (decoded && decoded.userId) {
                    // ✅ 🆕 추가: 로그아웃 로그 기록
                    await checkAndLogAccess(
                        decoded.userId,
                        req.ip,
                        'logout',
                        req.headers['user-agent']
                    ).catch(err => {
                        console.error('로그 저장 실패 (무시):', err);
                    });
                    
                    const user = await getUserForAuth(decoded.userId);
                    if (user && user.social && user.social.naver && user.social.naver.accessToken) {
                        try {
                            await revokeNaverToken(user.social.naver.accessToken);
                            await updateUserNaverToken(decoded.userId, null);
                            console.log('네이버 연동해제 및 토큰 삭제 완료');
                        } catch (error) {
                            console.error('네이버 연동해제 실패 (계속 진행):', error.message);
                        }
                    }
                }
            } catch (error) {
                console.error('토큰 처리 실패 (계속 진행):', error.message);
            }
        }
        
        // 쿠키 삭제 - 설정할 때와 동일한 옵션 사용
        res.clearCookie('refreshToken', clearCookieOptions);
        res.clearCookie('accessToken', clearCookieOptions);
        
        console.log('쿠키 삭제 후 프론트로 리다이렉트');
        return res.redirect(BASE_URL_FRONT);
    } catch (error) {
        console.error('로그아웃 리다이렉트 처리 중 오류:', error);
        res.clearCookie('refreshToken', clearCookieOptions);
        res.clearCookie('accessToken', clearCookieOptions);
        return res.redirect(BASE_URL_FRONT);
    }
};
