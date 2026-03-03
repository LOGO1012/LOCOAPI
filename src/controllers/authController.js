// src/controllers/authController.js
// 카카오 인증 요청에서 전달받은 인가코드를 검증하기 위한 Joi 스키마 임포트
import { kakaoAuthSchema } from '../dto/authValidator.js';
import { kakaoLogin } from '../services/authService.js';
import {findUserOrNoUser, getUserForAuth} from '../services/userService.js';
import jwt from 'jsonwebtoken';
import {blacklistToken, isBlacklisted} from '../utils/tokenBlacklist.js';
import dotenv from 'dotenv';
dotenv.config(); // .env 파일에 정의된 환경변수 로드

// JWT 서명에 사용할 비밀키를 환경변수에서 가져옴
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;
const BASE_URL_FRONT = process.env.BASE_URL_FRONT
const isProd = process.env.NODE_ENV === 'production';

// H-01 보안 조치: isProd 변수 활용하여 프로덕션에서 secure/strict 적용
const cookieOptions = {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path:     "/",
    maxAge:   7 * 24 * 60 * 60 * 1000,
};

// 쿠키 삭제용 옵션 (maxAge 없이, 설정 시와 동일한 옵션 사용)
const clearCookieOptions = {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? 'strict' : 'lax',
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
        console.log('카카오 콜백 요청 수신');

        // Joi 스키마를 통해 쿼리 파라미터를 검증 (code가 반드시 필요)
        const { error, value } = kakaoAuthSchema.validate(req.query);
        if (error) {
            // 검증 실패 시 에러 로그 출력 후 400 상태 코드 응답
            console.error('DTO 검증 오류:', error.details[0].message);
            return res.status(400).json({ message: error.details[0].message });
        }
        // 검증 성공 시 로그 출력
        console.log('DTO 검증 성공');

        // 검증된 값에서 인가코드를 추출
        const { code } = value;

        // 인가코드를 사용해 카카오 API와 통신, 액세스 토큰 및 사용자 정보 획득
        const kakaoUserData = await kakaoLogin(code);
        console.log('카카오 로그인 서비스 반환 완료');

        // DB에서 해당 카카오 사용자가 이미 존재하는지 확인
        const result = await findUserOrNoUser(kakaoUserData);

        // DB에 사용자 정보가 없다면 회원가입이 필요하므로, 회원가입 페이지로 리다이렉트
        // 카카오 정보를 쿼리 파라미터로 전달하여 회원가입 페이지에서 표시할 수 있도록 함
        if (result.status === 'noUser' || result.status === 'new_registration_required') {
            const statusMsg = result.status === 'noUser' ? '사용자가 존재하지 않음' : '보관된 사용자';
            console.log(`${statusMsg}, 신규 회원가입 필요`);
            
            let sessionSocialData; // Declare a mutable variable

            if (result.status === 'new_registration_required' && result.social) {
                // Transform the nested social object from ArchivedUser into a flat structure
                // that SignupForm.jsx expects (like kakaoUserData)
                const archivedKakaoData = result.social.kakao;
                if (archivedKakaoData) {
                    sessionSocialData = {
                        kakaoId: archivedKakaoData.providerId,
                        name: archivedKakaoData.name,
                        phoneNumber: archivedKakaoData.phoneNumber,
                        birthday: archivedKakaoData.birthday,
                        birthyear: archivedKakaoData.birthyear,
                        gender: archivedKakaoData.gender
                    };
                } else {
                    // Fallback if kakao data is somehow missing from archived social
                    sessionSocialData = kakaoUserData;
                }
            } else {
                // For 'noUser' case, use the original kakaoUserData
                sessionSocialData = kakaoUserData;
            }

            req.session.kakaoUserData = sessionSocialData; // Save to session
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

            // 세션에 reactivation 컨텍스트 저장 (C-06 보안 조치)
            req.session.reactivationContext = {
                userId: result.user._id.toString(),
                provider: 'kakao',
                expiresAt: Date.now() + 10 * 60 * 1000 // 10분 유효
            };

            return res.status(200).json({
                message: "계정 재활성화 필요",
                status: "reactivation_possible",
                user: result.user,
                socialData: kakaoUserData
            });
        }

        // 이미 등록된 사용자라면, DB에서 해당 사용자 정보를 변수에 저장
        const user = result;
        console.log('DB에서 사용자 처리 완료');


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


        const payload = {
            userId:  user._id,
            kakaoId: user.social.kakao.providerId,
            name:    user.name,
        };

        const accessToken  = jwt.sign(payload, JWT_SECRET,     { expiresIn: "2h" }); // 15분 → 2시간으로 연장
        const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: "7d" });

        // ✅ 🆕 추가: 접속 로그 기록
        const { checkAndLogAccess } = await import('../utils/logUtils.js');
        checkAndLogAccess(
            user._id.toString(),           // userId
            req.ip,                        // IP
            'login',                       // action
            req.headers['user-agent']      // userAgent
        ).catch(err => {
            console.error('로그 저장 실패 (무시):', err);
        });

        // 5) Refresh 토큰은 HttpOnly 쿠키로, Access 토큰은 JSON 바디로 응답
        // 수정 Refresh, Access 둘다 HttpOnly 쿠키로
        res
            .cookie('accessToken',  accessToken,  { ...cookieOptions, maxAge: 2 * 60 * 60 * 1000}) // 2시간
            .cookie('refreshToken', refreshToken, { ...cookieOptions , maxAge: 7*24*60*60*1000 })
            .json({
                message:     "카카오 로그인 성공",
                status:      "success",
                user: clientUser,
            });
    } catch (err) {
        console.error('카카오 콜백 처리 중 오류:', err.message);

        // ✅ 🆕 추가: 로그인 실패 로그 기록
        // userId는 특정할 수 없으므로 null 전달
        import('../utils/logUtils.js').then(({ checkAndLogAccess }) => {
            checkAndLogAccess(
                null,                          // userId
                req.ip,                        // IP
                'login',                       // action
                req.headers['user-agent'],     // userAgent
                'fail'                         // status
            ).catch(logErr => {
                console.error('실패 로그 저장 실패 (무시):', logErr);
            });
        });

        res.status(400).json({ success: false, message: err.message });
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
            res.clearCookie('accessToken', clearCookieOptions);
            return res.status(401).json({ message: '리프레시 토큰이 없습니다.' });
        }

        // 블랙리스트 체크 (로그아웃된 리프레시 토큰 거부)
        if (await isBlacklisted(rToken)) {
            res.clearCookie('refreshToken', clearCookieOptions);
            res.clearCookie('accessToken', clearCookieOptions);
            return res.status(401).json({ message: '로그아웃된 토큰입니다.' });
        }

        const payload = jwt.verify(rToken, REFRESH_SECRET);
        // DB에 실제 userId 존재 여부 확인
        const user = await getUserForAuth(payload.userId);
        if (!user) {
            return res.status(401).json({ message: '유효하지 않은 사용자입니다.' });
        }

        // ✅ 🆕 추가: 토큰 재발급 로그 (IP/기기 변경 시만 기록됨)
        const { checkAndLogAccess } = await import('../utils/logUtils.js');
        checkAndLogAccess(
            payload.userId,
            req.ip,
            'token_refresh',
            req.headers['user-agent']
        ).catch(err => {
            console.error('로그 저장 실패 (무시):', err);
        });

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
        res.clearCookie('refreshToken', clearCookieOptions);
        res.clearCookie('accessToken', clearCookieOptions);
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
                if (await isBlacklisted(token)) {
                    // 블랙리스트된 액세스 토큰 → 쿠키 단계로 이동
                    throw new Error('blacklisted');
                }
                const payload = jwt.verify(token, JWT_SECRET);
                const user = await getUserForAuth(payload.userId);
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
            res.clearCookie('accessToken', clearCookieOptions);
            return res.status(401).json({ message: '리프레시 토큰이 없습니다.' });
        }
        // 블랙리스트 체크
        if (await isBlacklisted(rToken)) {
            res.clearCookie('refreshToken', clearCookieOptions);
            res.clearCookie('accessToken', clearCookieOptions);
            return res.status(401).json({ message: '로그아웃된 토큰입니다.' });
        }
        let payload;
        try {
            payload = jwt.verify(rToken, REFRESH_SECRET);
        } catch {
            res.clearCookie('refreshToken', clearCookieOptions);
            res.clearCookie('accessToken', clearCookieOptions);
            return res.status(401).json({ message: '리프레시 토큰이 유효하지 않습니다.' });
        }

        const user = await getUserForAuth(payload.userId);
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
export const logout = async (req, res) => {
    console.log('로그아웃 요청 - 쿠키 삭제 시작');

    // JWT 토큰 블랙리스트 등록 (로그아웃 후 토큰 재사용 방지)
    await Promise.all([
        blacklistToken(req.cookies.accessToken),
        blacklistToken(req.cookies.refreshToken),
    ]);

    // ✅ 🆕 추가: 로그아웃 로그 기록
    if (req.user && req.user._id) {
        import('../utils/logUtils.js').then(({ checkAndLogAccess }) => {
            checkAndLogAccess(
                req.user._id.toString(),
                req.ip,
                'logout',
                req.headers['user-agent']
            ).catch(err => {
                console.error('로그 저장 실패 (무시):', err);
            });
        });
    }

    res.clearCookie('refreshToken', clearCookieOptions);
    res.clearCookie('accessToken', clearCookieOptions);

    console.log('쿠키 삭제 완료');
    return res.status(200).json({ message: "Logged out" });
};


/**
 * 로그아웃 후 프론트 리다이렉트 (카카오 로그아웃용)
 */
export const logoutRedirect = async (req, res) => {
    console.log('로그아웃 리다이렉트 - 쿠키 삭제 시작');

    // JWT 토큰 블랙리스트 등록
    await Promise.all([
        blacklistToken(req.cookies.accessToken),
        blacklistToken(req.cookies.refreshToken),
    ]);

    // 쿠키 삭제 - 설정할 때와 동일한 옵션 사용
    res.clearCookie('refreshToken', clearCookieOptions);
    res.clearCookie('accessToken', clearCookieOptions);

    console.log('쿠키 삭제 후 프론트로 리다이렉트');
    return res.redirect(BASE_URL_FRONT);
};

export const setSocialSession = (req, res) => {
    // C-09 보안 조치: reactivation 컨텍스트가 유효한 경우에만 세션 주입 허용
    const ctx = req.session.reactivationContext;
    if (!ctx) {
        return res.status(403).json({ success: false, message: '유효하지 않은 세션 요청입니다.' });
    }
    if (Date.now() > ctx.expiresAt) {
        delete req.session.reactivationContext;
        return res.status(403).json({ success: false, message: '요청이 만료되었습니다. 다시 로그인해 주세요.' });
    }

    const { socialData, provider, deactivationCount } = req.body;
    if (provider === 'kakao') {
        req.session.kakaoUserData = socialData;
    } else if (provider === 'naver') {
        req.session.naverUserData = socialData;
    }
    if (deactivationCount !== undefined) {
        req.session.deactivationCount = deactivationCount;
    }

    // 사용 완료 후 컨텍스트 삭제
    delete req.session.reactivationContext;

    res.status(200).json({ success: true });
};