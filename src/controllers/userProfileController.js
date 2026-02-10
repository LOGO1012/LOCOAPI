// src/controllers/userProfileController.js - KMS 사용 수정된 버전
import { User } from '../models/UserProfile.js'; 
import TermConsent from '../models/TermConsent.js'; // 약관 동의 모델 추가
import Term from '../models/Term.js'; // 약관 모델 추가
import { normalizePhoneNumber } from '../utils/normalizePhoneNumber.js';
import { saveNicknameHistory, saveGenderHistory } from '../services/historyService.js';
import { createUser } from '../services/userService.js';
import IntelligentCache from '../utils/cache/intelligentCache.js';
import { invalidateNicknameCaches } from '../utils/cache/cacheKeys.js';

/**
 * registerUserProfile - KMS 암호화를 사용하는 회원가입 함수
 */
export const registerUserProfile = async (req, res, next) => {
    try {
        // 🔧 디버깅을 위한 상세 요청 데이터 로깅
        console.log('📝 회원가입 요청 데이터 상세 분석:', {
            method: req.method,
            contentType: req.headers['content-type'],
            bodyKeys: Object.keys(req.body),
            bodyValues: req.body,
            hasNickname: !!req.body.nickname,
            nicknameValue: req.body.nickname,
            nicknameType: typeof req.body.nickname,
            nicknameLength: req.body.nickname?.length
        });
        
        // 회원가입 폼 및 URL 쿼리에서 전달된 정보 추출
        const { 
            kakaoId, 
            naverId, 
            nickname, 
            name, 
            phoneNumber, 
            birthdate, 
            birthday, 
            birthyear, 
            kakaoGender, 
            naverGender,
            formGender, 
            info,
            deactivationCount,
            termIds // 약관 동의 ID 배열
        } = req.body;
            
        // 🔧 닉네임 필수 검증 강화
        if (!nickname || typeof nickname !== 'string' || nickname.trim() === '') {
            console.error('❌ nickname 검증 실패:', { 
                nickname, 
                type: typeof nickname, 
                isEmpty: nickname === '',
                isNull: nickname === null,
                isUndefined: nickname === undefined,
                trimmed: nickname?.trim?.(),
                receivedData: req.body
            });
            return res.status(400).json({ 
                success: false,
                message: 'nickname이 필요합니다.',
                error: 'NICKNAME_REQUIRED',
                debug: {
                    received: nickname,
                    type: typeof nickname,
                    allFields: Object.keys(req.body)
                }
            });
        }

        // 🔧 필수 필드 추가 검증
        const requiredFields = {
            nickname: nickname?.trim(),
            formGender: formGender
        };

        const missingFields = [];
        for (const [field, value] of Object.entries(requiredFields)) {
            if (!value || (typeof value === 'string' && value.trim() === '')) {
                missingFields.push(field);
            }
        }

        if (missingFields.length > 0) {
            console.error('❌ 필수 필드 누락:', missingFields);
            return res.status(400).json({
                success: false,
                message: `필수 필드가 누락되었습니다: ${missingFields.join(', ')}`,
                error: 'REQUIRED_FIELDS_MISSING',
                missingFields
            });
        }

        // 🔒 소셜 로그인 필수 검증 (kakaoId 또는 naverId 중 하나는 필수)
        if (!kakaoId && !naverId) {
            console.error('❌ 소셜 로그인 필수 검증 실패: kakaoId와 naverId 모두 없음');
            return res.status(400).json({
                success: false,
                message: '소셜 로그인 후 회원가입이 가능합니다.',
                error: 'SOCIAL_LOGIN_REQUIRED'
            });
        }

        // 🔐 본인인증 필수 검증
        const identityData = req.session.identityVerification;
        if (!identityData || !identityData.verified) {
            console.error('❌ 본인인증 미완료 상태에서 회원가입 시도');
            return res.status(400).json({
                success: false,
                message: '본인인증을 먼저 완료해주세요.',
                error: 'IDENTITY_VERIFICATION_REQUIRED'
            });
        }

        // 🔐 CI 해시 중복 가입 체크 (가입 시점 재검증)
        const existingUserByCI = await User.findOne({ ci_hash: identityData.ci_hash, status: 'active' });
        if (existingUserByCI) {
            console.error('❌ CI 중복 가입 시도:', identityData.ci_hash?.substring(0, 10));
            return res.status(409).json({
                success: false,
                message: '이미 가입된 사용자입니다.',
                error: 'DUPLICATE_CI'
            });
        }

        // 🔥 사용자 데이터 준비 (본인인증 데이터 우선 사용)
        const userData = {
            // 본인인증 값 우선, 없으면 소셜 로그인 값 사용
            name: identityData.name || name?.trim() || '',
            nickname: nickname.trim(),
            gender: formGender?.trim() || 'select',
            phone: normalizePhoneNumber(identityData.phoneNumber || phoneNumber || ''),
            birthdate: identityData.birthDate || birthdate || '',
            info: info?.trim() || '',
            numOfChat: process.env.numOfChat,
            deactivationCount: deactivationCount || 0,
            // 🔐 본인인증 정보 (평문 - encryptUserData에서 한 번에 암호화)
            ci: identityData.ci,
            ci_hash: identityData.ci_hash,
            identityVerified: true,
            identityVerifiedAt: new Date(identityData.verifiedAt),
            social: {
                // 카카오 소셜 로그인 정보 (kakaoId가 있을 때만 추가)
                ...(kakaoId && {
                    kakao: {
                        providerId: kakaoId,
                        name: name || '',
                        phoneNumber: phoneNumber || '',
                        birthday: birthday || '',
                        birthyear: birthyear || '',
                        gender: kakaoGender || ''
                    }
                }),
                // 네이버 소셜 로그인 정보 (naverId가 있을 때만 추가)
                ...(naverId && {
                    naver: {
                        providerId: naverId,
                        name: name || '',
                        phoneNumber: phoneNumber || '',
                        birthday: birthday || '',
                        birthyear: birthyear || '',
                        gender: naverGender || ''
                    }
                })
            }
        };
        
        // 🔧 데이터 준비 완료 로그 (더 상세하게)
        console.log('✅ 사용자 데이터 준비 완료:', {
            hasName: !!userData.name,
            nameLength: userData.name?.length,
            hasNickname: !!userData.nickname,
            nickname: userData.nickname,
            nicknameLength: userData.nickname?.length,
            hasPhone: !!userData.phone,
            phoneLength: userData.phone?.length,
            hasBirthdate: !!userData.birthdate,
            gender: userData.gender,
            hasSocialKakao: !!userData.social?.kakao,
            hasSocialNaver: !!userData.social?.naver
        });

        // 🔥 핵심 수정: try-catch로 createUser 호출을 래핑하여 에러 처리 개선
        let savedUser;
        try {
            console.log('🔄 createUser 함수 사용 재개 (KMS 활성화)');
            
            // 🔧 KMS 활성화 상태 확인
            console.log('🔧 KMS 상태 확인:', {
                ENABLE_KMS: process.env.ENABLE_KMS,
                KMS_ENABLED: process.env.ENABLE_KMS === 'true',
                ENABLE_ENCRYPTION: process.env.ENABLE_ENCRYPTION
            });
            
            // 🔧 MongoDB 연결 상태 확인
            const mongoose = await import('mongoose');
            console.log('📋 MongoDB 상태:', {
                connected: mongoose.default.connection.readyState === 1,
                readyState: mongoose.default.connection.readyState
            });
            
            // 🔥 이제 createUser 함수를 정상적으로 사용 (KMS 암호화 포함)
            console.log('✨ KMS 암호화를 사용하여 createUser 호출 중...');
            savedUser = await createUser(userData);
            console.log('✅ 신규 User 등록 성공 (KMS 암호화 적용):', {
                id: savedUser._id,
                nickname: savedUser.nickname,
                createdAt: savedUser.createdAt,
                encryptedFields: {
                    name: savedUser.name ? '암호화됨' : '없음',
                    phone: savedUser.phone ? '암호화됨' : '없음',
                    birthdate: savedUser.birthdate ? '암호화됨' : '없음'
                }
            });
        } catch (createError) {
            console.error('❌ 사용자 생성 실패 - 상세 정보:', {
                errorName: createError.name,
                errorMessage: createError.message,
                errorStack: createError.stack?.split('\n')[0],
                errorCode: createError.code,
                isKMSError: createError.message?.includes('KMS') || createError.message?.includes('암호화'),
                mongoErrors: createError.errors ? Object.keys(createError.errors) : null,
                inputData: {
                    nickname: userData?.nickname,
                    hasName: !!userData?.name,
                    hasPhone: !!userData?.phone,
                    gender: userData?.gender
                }
            });
            
            // 🔧 KMS 오류 시 폴백 처리
            if (createError.message?.includes('KMS') || createError.message?.includes('암호화')) {
                console.log('⚠️  KMS 오류 발생, 암호화 비활성화하여 재시도...');
                
                // KMS 일시 비활성화
                const originalKMS = process.env.ENABLE_KMS;
                process.env.ENABLE_KMS = 'false';
                process.env.ENABLE_ENCRYPTION = 'false';
                
                try {
                    console.log('🔄 암호화 비활성화 상태로 재시도...');
                    savedUser = await createUser(userData);
                    console.log('✅ 폴백으로 사용자 생성 성공 (암호화 비활성화)');
                    
                    // KMS 설정 원복
                    process.env.ENABLE_KMS = originalKMS;
                    
                    // 경고 메시지 추가
                    console.warn('⚠️  경고: KMS 암호화가 비활성화된 상태로 사용자가 생성되었습니다.');
                } catch (fallbackError) {
                    // 폴백도 실패한 경우
                    process.env.ENABLE_KMS = originalKMS;
                    throw fallbackError;
                }
            } else {
                // KMS 오류가 아닌 경우 기존 로직 유지
                throw createError;
            }
            
            // 🔧 구체적인 에러 타입별 처리
            if (createError.name === 'ValidationError') {
                const validationErrors = Object.keys(createError.errors).map(key => ({
                    field: key,
                    message: createError.errors[key].message,
                    receivedValue: createError.errors[key].value
                }));
                
                return res.status(400).json({
                    success: false,
                    message: '사용자 데이터 검증 실패',
                    error: 'VALIDATION_ERROR',
                    validationErrors,
                    debug: {
                        preparedData: userData,
                        errorName: createError.name
                    }
                });
            }
            
            if (createError.code === 11000) { // MongoDB 중복 키 에러
                return res.status(409).json({
                    success: false,
                    message: '이미 사용 중인 닉네임입니다.',
                    error: 'DUPLICATE_NICKNAME'
                });
            }
            
            // 암호화 관련 에러
            if (createError.message.includes('KMS') || createError.message.includes('암호화')) {
                console.warn('🔄 암호화 에러 발생, KMS 처리 시도...');
                return res.status(500).json({
                    success: false,
                    message: '사용자 등록 중 암호화 처리에 문제가 발생했습니다.',
                    error: 'ENCRYPTION_ERROR',
                    debug: process.env.NODE_ENV === 'development' ? createError.message : undefined
                });
            }
            
            // 기타 예상치 못한 에러
            throw createError;
        }

        // 🔧 히스토리 저장도 try-catch로 보호
        try {
            // 회원가입 시 닉네임 히스토리 저장
            await saveNicknameHistory(
                savedUser._id,
                null,  // 회원가입 시에는 이전 닉네임이 없음
                savedUser.nickname,
                'signup',
                savedUser._id,  // 자신이 생성
                req
            );

            // 회원가입 시 성별 히스토리 저장
            await saveGenderHistory(
                savedUser._id,
                null,  // 회원가입 시에는 이전 성별이 없음
                savedUser.gender,
                'signup',
                savedUser._id,  // 자신이 생성
                req
            );

            await invalidateNicknameCaches(IntelligentCache, savedUser.nickname);
            console.log(`✅ [회원가입] 캐시 무효화: ${savedUser.nickname}`);

            // ✅ 약관 동의/거절 기록 저장 (모든 유효 약관에 대해)
            try {
                const now = new Date();
                // 1. 현재 유효한 모든 약관 조회
                const types = ['TERMS', 'PRIVACY', 'MARKETING'];
                const activeTerms = [];

                for (const type of types) {
                    const term = await Term.findOne({
                        type,
                        effectiveDate: { $lte: now }
                    }).sort({ effectiveDate: -1, version: -1 });
                    
                    if (term) activeTerms.push(term);
                }

                if (activeTerms.length > 0) {
                    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
                    // 사용자가 동의한 ID 목록 (없으면 빈 배열)
                    const agreedIds = (termIds && Array.isArray(termIds)) ? termIds : [];

                    const consentPromises = activeTerms.map(term => {
                        const isAgreed = agreedIds.includes(term._id.toString());
                        return new TermConsent({
                            userId: savedUser._id,
                            termId: term._id,
                            hasAgreed: isAgreed,
                            ipAddress
                        }).save();
                    });
                    
                    await Promise.all(consentPromises);
                    console.log(`✅ [회원가입] 약관 의사표시 기록 저장 완료 (${activeTerms.length}건)`);
                }
            } catch (consentError) {
                console.error('⚠️ 약관 동의 기록 저장 실패:', consentError);
                // 약관 저장이 실패해도 회원가입은 성공 처리
            }

            console.log('✅ 회원가입 및 히스토리 저장 완료 (KMS 암호화 적용)');
        } catch (historyError) {
            console.warn('⚠️ 히스토리 저장 실패 (사용자 등록은 성공):', historyError.message);
            // 히스토리 저장 실패는 치명적이지 않으므로 계속 진행
        }

        // 🔥 수정: 응답에서 민감 정보 완전 제거
        const responseUser = {
            _id: savedUser._id,
            nickname: savedUser.nickname,
            gender: savedUser.gender,
            profilePhoto: savedUser.profilePhoto || '',
            info: savedUser.info || '',
            numOfChat: savedUser.numOfChat || 0,
            createdAt: savedUser.createdAt,
            updatedAt: savedUser.updatedAt,
            // 암호화된 필드(name, phone, birthdate)는 응답에서 완전 제외
            // social 정보도 민감할 수 있으므로 제외
        };

        // 회원가입 성공 응답
        return res.status(201).json({
            success: true,
            message: '회원가입이 성공적으로 완료되었습니다. (KMS 암호화 적용)',
            user: responseUser
        });

    } catch (error) {
        // 🔧 전체적인 에러 핸들링 개선
        console.error('❌ 회원가입 컨트롤러 최상위 에러:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            requestData: req.body
        });
        
        // 에러 응답 반환 (400 상태 코드와 구체적인 메시지 사용)
        return res.status(400).json({
            success: false,
            message: error.message || '회원가입 처리 중 오류가 발생했습니다.',
            error: error.name || 'SIGNUP_FAILED'
        });
    }
};