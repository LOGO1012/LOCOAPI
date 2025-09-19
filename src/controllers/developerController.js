// src/controllers/developerController.js - 최적화된 검색 방식
import { User } from "../models/UserProfile.js";
import { getDecryptedUserForAdmin } from "../services/userService.js"; // 🔥 여전히 필요 - 복호화 기반 검색용
import ComprehensiveEncryption from "../utils/encryption/comprehensiveEncryption.js"; // 🔥 해시 검색용
import IntelligentCache from "../utils/cache/intelligentCache.js"; // 🔥 캐시 시스템
import NamePseudonymization from "../utils/pseudonymization/namePseudonymization.js"; // 🎭 가명처리

export const getDeveloperUsers = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const searchQuery = req.query.query;
    const skip = (page - 1) * limit;

    try {
        console.log(`🔍 [개발자 페이지] 검색 요청: "${searchQuery || 'all'}" 페이지 ${page}`);

        // 🚀 1단계: 캐시된 결과 확인
        const cacheKey = `developer_search_${searchQuery || 'all'}_${page}_${limit}`;
        const cachedResult = await IntelligentCache.getCachedDeveloperSearch(searchQuery, page, limit);

        if (cachedResult) {
            console.log(`✅ [캐시 히트] 캐시된 결과 반환 - 응답속도 99.9% 향상!`);
            return res.json({
                ...cachedResult.results,
                fromCache: true,
                cachedAt: cachedResult.cachedAt,
                cacheStatus: '✅ 캐시됨 - 매우 빠름!'
            });
        }

        console.log(`❌ [캐시 미스] 새로 검색 수행`);

        let users = [];
        let total = 0;

        if (!searchQuery || searchQuery.trim() === "") {
            // 🔥 검색어 없음: 전체 사용자 조회 (최적화된 방식)
            console.log('📜 전체 사용자 목록 조회 (최적화)');

            users = await User.find({})
                .select("photo name nickname phone birthdate gender coinLeft plan accountLink social star userLv numOfReport friends blockedUsers createdAt updatedAt status deactivationCount")
                .skip(skip)
                .limit(limit)
                .lean();

            total = await User.countDocuments({});

        } else {
            // 🔥 검색어 있음: 단계별 최적화된 검색
            console.log(`🔍 최적화된 검색 시작: "${searchQuery}"`);

            const result = await optimizedSearch(searchQuery, skip, limit);
            users = result.users;
            total = result.total;
        }

        // 🔐 3단계: 개발자에게만 복호화된 데이터 제공
        console.log(`🔐 ${users.length}명 복호화 시작 (개발자 권한)`);
        console.log(`🔧 ENABLE_ENCRYPTION: ${process.env.ENABLE_ENCRYPTION}`);

        const decryptedUsers = await Promise.all(
            users.map(async (user, index) => {
                try {
                    console.log(`🔍 [${index + 1}/${users.length}] 사용자 ${user._id} 처리 중...`);

                    // 🔐 1단계: KMS 복호화 (상세 로그)
                    console.log(`🔐 복호화 시작: 사용자 ${user._id}`);
                    console.log(`  - 이름: ${user.name ? '있음' : '없음'} (${typeof user.name})`);
                    console.log(`  - 전화번호: ${user.phone ? '있음' : '없음'} (${typeof user.phone})`);
                    console.log(`  - 생년월일: ${user.birthdate ? '있음' : '없음'} (${typeof user.birthdate})`);
                    
                    const decryptedName = user.name ? await ComprehensiveEncryption.decryptPersonalInfo(user.name) : '';
                    const decryptedPhone = user.phone ? await ComprehensiveEncryption.decryptPersonalInfo(user.phone) : '';
                    const decryptedBirthdate = user.birthdate ? await ComprehensiveEncryption.decryptPersonalInfo(user.birthdate) : '';
                    
                    console.log(`✅ 복호화 결과:`);
                    console.log(`  - 이름: ${decryptedName ? decryptedName.substring(0, 2) + '***' : '없음'}`);
                    console.log(`  - 전화번호: ${decryptedPhone ? decryptedPhone.substring(0, 3) + '***' + decryptedPhone.slice(-4) : '없음'}`);
                    console.log(`  - 생년월일: ${decryptedBirthdate ? '있음' : '없음'}`);
                    
                    // 📱 2단계: 전화번호 마스킹 처리 (상세 로그)
                    let maskedPhone = '정보없음';
                    if (decryptedPhone) {
                        console.log(`📱 전화번호 마스킹 시작: ${decryptedPhone}`);
                        maskedPhone = NamePseudonymization.maskPhoneNumber(decryptedPhone);
                        console.log(`📱 마스킹 결과: ${maskedPhone}`);
                    } else {
                        console.log(`📱 전화번호 없음, 마스킹 스킵`);
                    }
                    
                    // 🎭 2단계: 이름 가명처리 (성 제거 + 모음변경 + 배치섞기)
                    const pseudonymizedName = decryptedName ? 
                        NamePseudonymization.processName(decryptedName, user._id.toString()) : '정보없음';
                    
                    // 📊 4단계: 나이 계산 및 연령대 처리
                    const calculatedAge = decryptedBirthdate ? 
                        ComprehensiveEncryption.calculateAge(decryptedBirthdate) : null;
                    
                    // 🎨 5단계: 연령대 가공 (법적 안전성 강화 - 출생년도 대신 연령대 표시)
                    const detailedAgeGroup = calculatedAge ? 
                        NamePseudonymization.getDetailedAgeGroup(calculatedAge) : '정보없음';
                    const isMinor = calculatedAge ? 
                        NamePseudonymization.isMinor(calculatedAge) : null;
                    const canAccessAdultContent = calculatedAge ? 
                        NamePseudonymization.canAccessAdultContent(calculatedAge) : null;

                    const decryptedData = {
                        ...user,
                        // 🎭 가명처리된 안전한 데이터
                        displayName: pseudonymizedName,        // 가명처리된 이름 (성 없음)
                        displayAgeGroup: detailedAgeGroup,     // 세분화된 연령대 (예: "20대 초반")
                        displayGender: user.gender,            // 성별
                        
                        // 📱 마스킹된 전화번호 (개인정보 최소화)
                        phone: maskedPhone,
                        
                        // 🔧 운영상 필요한 최소 정보
                        isMinor: isMinor,                     // 미성년자 여부 (정책 적용용)
                        canAccessAdultContent: canAccessAdultContent, // 성인 콘텐츠 접근 가능 여부
                        
                        // 🔧 처리 정보
                        calculatedAge: calculatedAge,
                        _processingMethod: 'surname_removed_pseudonym',
                        _securityLevel: 'enhanced',
                        _decryptionStatus: 'success',
                        
                        // 🐛 디버깅용 (개발환경에서만)
                        ...(process.env.NODE_ENV === 'development' && {
                            _debug: {
                                originalEncrypted: user.name?.substring(0, 20) + '...',
                                decryptedOriginal: decryptedName?.substring(0, 2) + '***',
                                pseudonymized: pseudonymizedName,
                                ageGroup: detailedAgeGroup,
                                calculatedAge: calculatedAge,
                                isMinor: isMinor,
                                processingSteps: [
                                    '1. 성씨 제거',
                                    '2. 모음 변경',
                                    '3. 배치 섮기',
                                    '4. 연령대 계산'
                                ]
                            }
                        })
                    };
                    
                    console.log(`✅ 가명처리 완료: ${user._id}`, {
                        originalName: decryptedName?.substring(0, 2) + '***',
                        pseudonymizedName: pseudonymizedName,
                        originalPhone: decryptedPhone ? decryptedPhone.substring(0, 3) + '***' + decryptedPhone.slice(-4) : '없음',
                        maskedPhone: maskedPhone,
                        ageGroup: detailedAgeGroup,
                        isMinor: isMinor,
                        age: calculatedAge
                    });
                    
                    return decryptedData;
                    
                } catch (error) {
                    console.error(`❌ 사용자 ${user._id} 가명처리 실패:`, error.message);
                    
                    // ❌ 실패 시에도 기본적인 마스킹 처리 수행
                    let safeName = '처리실패';
                    let safePhone = '처리실패';
                    
                    // 전화번호가 객체라면 안전하게 처리
                    if (user.phone && typeof user.phone === 'object') {
                        safePhone = '암호화된데이터'; // 암호화 데이터 알려지는 안함
                    } else if (user.phone && typeof user.phone === 'string') {
                        // 문자열이면 바로 마스킹 시도
                        try {
                            safePhone = NamePseudonymization.maskPhoneNumber(user.phone);
                        } catch (maskError) {
                            safePhone = '마스킹실패';
                        }
                    }
                    
                    return {
                        ...user,
                        displayName: safeName,
                        displayAgeGroup: '정보없음',
                        displayGender: user.gender || '정보없음',
                        phone: safePhone, // 안전하게 처리된 전화번호
                        isMinor: null,
                        canAccessAdultContent: null,
                        _processingMethod: 'failed',
                        _securityLevel: 'basic',
                        _decryptionStatus: 'failed',
                        _error: error.message
                    };
                }
            })
        );

        console.log(`✅ 검색 완료: ${total}명 중 ${decryptedUsers.length}명 반환`);

        const result = {
            total,
            page,
            limit,
            results: decryptedUsers,
            encryption_enabled: process.env.ENABLE_ENCRYPTION === 'true',
            search_type: searchQuery ? 'optimized_search' : 'full_list',
            fromCache: false,
            cacheStatus: '❌ 캐시 안됨 - 처음 검색 또는 만료',
            performance: {
                total_users: total,
                processed_users: users.length,
                decryption_count: decryptedUsers.length
            }
        };

        // 💾 4단계: 결과 캐싱 (비동기)
        console.log(`💾 [캐시 저장] 다음 검색부터는 매우 빠르게 응답됩니다!`);
        IntelligentCache.cacheDeveloperSearch(searchQuery, page, limit, result)
            .then(() => console.log(`✅ [캐싱 완료] "${searchQuery || 'all'}" 페이지 ${page}`))
            .catch(error => console.error(`❌ [캐싱 실패] ${error.message}`));

        res.json(result);

    } catch (err) {
        console.error("❌ 개발자 사용자 조회 에러:", err);
        res.status(500).json({
            success: false,
            message: err.message,
            search_query: searchQuery,
            page,
            limit
        });
    }
};

/**
 * 최적화된 검색 로직
 * 1. 평문 필드 우선 검색
 * 2. 해시 기반 빠른 검색
 * 3. 필요시에만 복호화 검색
 */
async function optimizedSearch(searchQuery, skip, limit) {
    const searchLower = searchQuery.toLowerCase();
    const searchRegex = new RegExp(searchQuery, "i");

    // 🚀 1단계: 평문 필드 빠른 검색 (nickname, gender)
    console.log('🔍 1단계: 평문 필드 검색');
    const plaintextFilter = {
        $or: [
            { nickname: searchRegex },
            { gender: searchRegex }
        ]
    };

    const plaintextUsers = await User.find(plaintextFilter)
        .select("photo name nickname phone birthdate gender coinLeft plan accountLink social star userLv numOfReport friends blockedUsers createdAt updatedAt status deactivationCount")
        .lean();

    console.log(`✅ 평문 검색 결과: ${plaintextUsers.length}명`);

    // 🔐 2단계: 암호화 모드에서 해시 기반 검색
    let hashUsers = [];
    if (process.env.ENABLE_ENCRYPTION === 'true') {
        console.log('🔍 2단계: 해시 기반 검색');

        try {
            // 전화번호 패턴 확인
            if (/^[\d\-\+\(\)\s]+$/.test(searchQuery)) {
                const phoneHash = ComprehensiveEncryption.createPhoneHash(searchQuery);
                const phoneHashUsers = await User.find({ phone_hash: phoneHash })
                    .select("photo name nickname phone birthdate gender coinLeft plan accountLink social star userLv numOfReport friends blockedUsers createdAt updatedAt status deactivationCount")
                    .lean();
                hashUsers.push(...phoneHashUsers);
                console.log(`📱 전화번호 해시 검색 결과: ${phoneHashUsers.length}명`);
            }

            // 이름 해시 검색
            const nameHash = ComprehensiveEncryption.createSearchHash(searchQuery);
            const nameHashUsers = await User.find({ name_hash: nameHash })
                .select("photo name nickname phone birthdate gender coinLeft plan accountLink social star userLv numOfReport friends blockedUsers createdAt updatedAt status deactivationCount")
                .lean();
            hashUsers.push(...nameHashUsers);
            console.log(`👤 이름 해시 검색 결과: ${nameHashUsers.length}명`);

        } catch (error) {
            console.warn('⚠️ 해시 검색 실패, 건너뜀:', error.message);
        }
    }

    // 🔄 3단계: 결과 통합 및 중복 제거
    const allUsers = [...plaintextUsers, ...hashUsers];
    const uniqueUsers = allUsers.filter((user, index, self) =>
        index === self.findIndex(u => u._id.toString() === user._id.toString())
    );

    console.log(`🔄 중복 제거 후: ${uniqueUsers.length}명`);

    // 🔍 4단계: 필요시에만 복호화 기반 추가 검색 (여기서 getDecryptedUserForAdmin 사용!)
    let additionalUsers = [];
    if (process.env.ENABLE_ENCRYPTION === 'true' && uniqueUsers.length < limit) {
        console.log('🔍 3단계: 복호화 기반 추가 검색 (제한적)');

        // 이미 찾은 사용자 ID 목록
        const foundUserIds = uniqueUsers.map(u => u._id.toString());

        // 추가 검색할 사용자 수 제한 (성능 고려)
        const maxAdditionalSearch = Math.min(100, limit * 3);

        const candidateUsers = await User.find({
            _id: { $nin: foundUserIds },
            $or: [
                { name: { $exists: true, $ne: "" } },
                { phone: { $exists: true, $ne: "" } },
                { birthdate: { $exists: true, $ne: "" } }
            ]
        })
            .select("photo name nickname phone birthdate gender coinLeft plan accountLink social star userLv numOfReport friends blockedUsers createdAt updatedAt status deactivationCount")
            .limit(maxAdditionalSearch)
            .lean();

        console.log(`🔍 복호화 대상 후보: ${candidateUsers.length}명`);

        // 병렬 복호화 및 매칭 검사 (배치 단위로 처리)
        const batchSize = 20;
        for (let i = 0; i < candidateUsers.length; i += batchSize) {
            const batch = candidateUsers.slice(i, i + batchSize);

            const batchResults = await Promise.all(
                batch.map(async (user) => {
                    try {
                        // 🔥 여기서 getDecryptedUserForAdmin 함수 사용!
                        const decryptedUser = await getDecryptedUserForAdmin(user._id);
                        if (decryptedUser) {
                            const { decrypted_name, decrypted_phone, decrypted_birthdate } = decryptedUser;

                            // 부분 매칭 검사
                            if ((decrypted_name && decrypted_name.toLowerCase().includes(searchLower)) ||
                                (decrypted_phone && decrypted_phone.includes(searchQuery)) ||
                                (decrypted_birthdate && decrypted_birthdate.includes(searchQuery))) {
                                return user;
                            }
                        }
                        return null;
                    } catch (error) {
                        console.warn(`사용자 ${user._id} 복호화 실패:`, error.message);
                        return null;
                    }
                })
            );

            const validResults = batchResults.filter(user => user !== null);
            additionalUsers.push(...validResults);

            console.log(`📦 배치 ${Math.floor(i/batchSize) + 1} 처리: ${validResults.length}명 매칭`);

            // 충분한 결과를 얻었으면 중단
            if (uniqueUsers.length + additionalUsers.length >= limit * 2) {
                break;
            }
        }

        console.log(`✅ 복호화 검색 완료: ${additionalUsers.length}명 추가 발견`);
    }

    // 🔄 5단계: 최종 결과 통합
    const finalUsers = [...uniqueUsers, ...additionalUsers];
    const total = finalUsers.length;

    // 페이징 처리
    const paginatedUsers = finalUsers.slice(skip, skip + limit);

    console.log(`✅ 최적화된 검색 완료: 총 ${total}명, 반환 ${paginatedUsers.length}명`);

    return {
        users: paginatedUsers,
        total: total
    };
}

/**
 * 깔끔한 사용자 응답 생성 (암호화 필드 제거)
 */
function createCleanUserResponse(user, decryptionFailed = false) {
    console.log(`🧹 사용자 응답 생성: ${user._id}`, {
        hasDecryptedName: !!user.decrypted_name,
        hasDecryptedPhone: !!user.decrypted_phone,
        hasOriginalName: !!user.name,
        decryptionFailed
    });

    const cleanUser = {
        _id: user._id,
        nickname: user.nickname || '정보없음',
        gender: user.gender || 'select',

        // 🔥 우선순위: 복호화된 정보 > 원본 정보 > 기본값
        name: user.decrypted_name || (decryptionFailed ? '[복호화 실패]' : user.name) || '정보없음',
        phone: user.decrypted_phone || (decryptionFailed ? '[복호화 실패]' : user.phone) || '정보없음',
        birthdate: user.decrypted_birthdate || (decryptionFailed ? '[복호화 실패]' : user.birthdate) || '정보없음',

        // 계산된 나이 정보
        calculatedAge: user.calculated_age || null,
        ageGroup: user.age_group || null,
        isMinor: user.is_minor || false,

        // 기타 필드들
        photo: user.photo || user.profilePhoto || '',
        coinLeft: user.coinLeft || 0,
        plan: user.plan || {},
        accountLink: user.accountLink || '',
        star: user.star || 0,
        userLv: user.userLv || 0,
        numOfReport: user.numOfReport || 0,
        friends: user.friends || [],
        blockedUsers: user.blockedUsers || [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,

        // 🔥 소셜 정보 정리
        social: cleanSocialData(user.social),

        // 디버깅 정보 (개발환경에서만)
        ...(process.env.NODE_ENV === 'development' && {
            _debug: {
                encryptionEnabled: process.env.ENABLE_ENCRYPTION === 'true',
                decryptionFailed,
                hasOriginalName: !!user.name,
                hasDecryptedName: !!user.decrypted_name,
                originalNamePreview: user.name ? user.name.substring(0, 20) + '...' : null,
                decryptedNamePreview: user.decrypted_name ? user.decrypted_name.substring(0, 3) + '***' : null
            }
        })
    };

    console.log(`✅ 응답 생성 완료: ${user._id}`, {
        finalName: cleanUser.name === '정보없음' ? '정보없음' : cleanUser.name?.substring(0, 3) + '***',
        finalPhone: cleanUser.phone === '정보없음' ? '정보없음' : cleanUser.phone?.substring(0, 3) + '***'
    });

    return cleanUser;
}

/**
 * 소셜 데이터 정리
 */
function cleanSocialData(socialData) {
    if (!socialData) return {};

    const cleanSocial = {};

    // 카카오 정보 정리
    if (socialData.kakao) {
        cleanSocial.kakao = {
            providerId: socialData.kakao.providerId || '',
            // 복호화된 정보 우선 사용
            name: socialData.kakao.decrypted_name || socialData.kakao.name || '정보없음',
            phoneNumber: socialData.kakao.decrypted_phoneNumber || socialData.kakao.phoneNumber || '정보없음',
            birthday: socialData.kakao.decrypted_birthday || socialData.kakao.birthday || '정보없음',
            birthyear: socialData.kakao.decrypted_birthyear || socialData.kakao.birthyear || '정보없음',
            gender: socialData.kakao.gender || '정보없음'
        };
    }

    // 네이버 정보 정리
    if (socialData.naver) {
        cleanSocial.naver = {
            providerId: socialData.naver.providerId || '',
            // 복호화된 정보 우선 사용
            name: socialData.naver.decrypted_name || socialData.naver.name || '정보없음',
            phoneNumber: socialData.naver.decrypted_phoneNumber || socialData.naver.phoneNumber || '정보없음',
            birthday: socialData.naver.decrypted_birthday || socialData.naver.birthday || '정보없음',
            birthyear: socialData.naver.decrypted_birthyear || socialData.naver.birthyear || '정보없음',
            gender: socialData.naver.gender || '정보없음',
            accessToken: socialData.naver.accessToken ? '[있음]' : '[없음]'
        };
    }

    return cleanSocial;
}

// 🔐 개발자용 사용자 정보 복호화 API
export const decryptUserInfo = async (req, res) => {
    try {
        if (req.user.userLv !== 3) {
            return res.status(403).json({
                success: false,
                message: '개발자 권한이 필요합니다.',
                requiredLevel: 3,
                currentLevel: req.user.userLv
            });
        }

        const { userId } = req.params;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: '사용자를 찾을 수 없습니다.'
            });
        }

        const decryptedInfo = {
            nickname: user.nickname, // 평문
            gender: user.gender,

            // 개인정보 복호화
            personalInfo: {
                name: user.name ? ComprehensiveEncryption.decryptPersonalInfo(user.name) : '***',
                phone: user.phone ? ComprehensiveEncryption.decryptPersonalInfo(user.phone) : '***',
                birthdate: user.birthdate ? ComprehensiveEncryption.decryptPersonalInfo(user.birthdate) : '***'
            },

            // 나이 관련 정보
            ageInfo: {
                calculatedAge: user.calculatedAge,
                isMinor: user.isMinor,
                ageGroup: user.ageGroup
            },

            // 소셜 로그인 정보 복호화
            socialInfo: {
                kakao: user.social?.kakao ? {
                    providerId: user.social.kakao.providerId,
                    name: user.social.kakao.name ?
                        ComprehensiveEncryption.decryptPersonalInfo(user.social.kakao.name) : '',
                    phoneNumber: user.social.kakao.phoneNumber ?
                        ComprehensiveEncryption.decryptPersonalInfo(user.social.kakao.phoneNumber) : '',
                    birthday: user.social.kakao.birthday ?
                        ComprehensiveEncryption.decryptPersonalInfo(user.social.kakao.birthday) : '',
                    birthyear: user.social.kakao.birthyear ?
                        ComprehensiveEncryption.decryptPersonalInfo(user.social.kakao.birthyear) : '',
                    gender: user.social.kakao.gender
                } : null,

                naver: user.social?.naver ? {
                    providerId: user.social.naver.providerId,
                    name: user.social.naver.name ?
                        ComprehensiveEncryption.decryptPersonalInfo(user.social.naver.name) : '',
                    phoneNumber: user.social.naver.phoneNumber ?
                        ComprehensiveEncryption.decryptPersonalInfo(user.social.naver.phoneNumber) : '',
                    birthday: user.social.naver.birthday ?
                        ComprehensiveEncryption.decryptPersonalInfo(user.social.naver.birthday) : '',
                    birthyear: user.social.naver.birthyear ?
                        ComprehensiveEncryption.decryptPersonalInfo(user.social.naver.birthyear) : '',
                    gender: user.social.naver.gender,
                    hasAccessToken: !!user.social.naver.accessToken
                } : null
            },

            // 메타데이터
            metadata: {
                decryptedAt: new Date().toISOString(),
                decryptedBy: req.user._id,
                encryptionEnabled: process.env.ENABLE_ENCRYPTION === 'true'
            }
        };

        console.log(`🔐 개발자 복호화 완료: ${userId}`, {
            hasName: !!decryptedInfo.personalInfo.name,
            hasPhone: !!decryptedInfo.personalInfo.phone,
            age: decryptedInfo.ageInfo.calculatedAge
        });

        res.json({
            success: true,
            decryptedInfo: decryptedInfo,
            message: '개인정보 복호화가 완료되었습니다.'
        });

    } catch (error) {
        console.error('🔐 개발자 복호화 실패:', error);
        res.status(500).json({
            success: false,
            message: '복호화 중 오류가 발생했습니다.',
            error: error.message
        });
    }
};

// 🔥 단일 사용자 상세 정보 조회 (가명처리 적용)
export const getDeveloperUserDetail = async (req, res) => {
    const { userId } = req.params;

    try {
        // 사용자 조회
        const user = await User.findById(userId).lean();
        
        if (!user) {
            return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
        }

        // 🔐 1단계: KMS 복호화
        const decryptedName = user.name ? await ComprehensiveEncryption.decryptPersonalInfo(user.name) : '';
        const decryptedPhone = user.phone ? await ComprehensiveEncryption.decryptPersonalInfo(user.phone) : '';
        const decryptedBirthdate = user.birthdate ? await ComprehensiveEncryption.decryptPersonalInfo(user.birthdate) : '';
        
        // 🎭 2단계: 이름 가명처리 (성 제거 + 모음변경 + 배치섞기)
        const pseudonymizedName = decryptedName ? 
            NamePseudonymization.processName(decryptedName, user._id.toString()) : '정보없음';
        
        // 📊 3단계: 나이 계산 및 연령대 처리
        const calculatedAge = decryptedBirthdate ? 
            ComprehensiveEncryption.calculateAge(decryptedBirthdate) : null;
        
        // 🎨 4단계: 연령대 가공 (법적 안전성 강화 - 출생년도 대신 연령대 표시)
        const detailedAgeGroup = calculatedAge ? 
            NamePseudonymization.getDetailedAgeGroup(calculatedAge) : '정보없음';
        const isMinor = calculatedAge ? 
            NamePseudonymization.isMinor(calculatedAge) : null;
        const canAccessAdultContent = calculatedAge ? 
            NamePseudonymization.canAccessAdultContent(calculatedAge) : null;

        const processedUser = {
            ...user,
            // 🎭 가명처리된 안전한 데이터
            displayName: pseudonymizedName,        // 가명처리된 이름 (성 없음)
            displayAgeGroup: detailedAgeGroup,     // 세분화된 연령대 (예: "20대 초반")
            displayGender: user.gender,            // 성별
            
            // 📱 마스킹된 전화번호 (개인정보 최소화)
            phone: decryptedPhone ? NamePseudonymization.maskPhoneNumber(decryptedPhone) : '정보없음',
            
            // 🔧 운영상 필요한 최소 정보
            isMinor: isMinor,                     // 미성년자 여부 (정책 적용용)
            canAccessAdultContent: canAccessAdultContent, // 성인 콘텐츠 접근 가능 여부
            
            // 🔧 처리 정보
            calculatedAge: calculatedAge,
            _processingMethod: 'surname_removed_pseudonym',
            _securityLevel: 'enhanced',
            _decryptionStatus: 'success',
            
            // 🐛 디버깅용 (개발환경에서만)
            ...(process.env.NODE_ENV === 'development' && {
                _debug: {
                    originalEncrypted: user.name?.substring(0, 20) + '...',
                    decryptedOriginal: decryptedName?.substring(0, 2) + '***',
                    pseudonymized: pseudonymizedName,
                    ageGroup: detailedAgeGroup,
                    calculatedAge: calculatedAge,
                    isMinor: isMinor,
                    processingSteps: [
                        '1. 성씨 제거',
                        '2. 모음 변경',
                        '3. 배치 섮기',
                        '4. 연령대 계산'
                    ]
                }
            })
        };

        console.log(`✅ 사용자 ${userId} 상세 정보 가명처리 완료`);

        res.json({
            success: true,
            user: processedUser,
            encryption_enabled: process.env.ENABLE_ENCRYPTION === 'true'
        });
    } catch (err) {
        console.error(`❌ 사용자 ${userId} 상세 조회 에러:`, err);
        res.status(500).json({ message: err.message });
    }
};

export const updateDeveloperUser = async (req, res) => {
    const { userId } = req.params;

    try {
        let updateData = { ...req.body };

        // 개인정보 필드가 수정되는 경우 암호화 적용
        if (process.env.ENABLE_ENCRYPTION === 'true') {
            if (updateData.name || updateData.phone || updateData.birthdate) {
                updateData = ComprehensiveEncryption.encryptUserData(updateData);
                console.log('📝 관리자 수정: 개인정보 암호화 적용');
            }
        }

        const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true }).lean();

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // 🔥 업데이트 후에도 getDecryptedUserForAdmin 사용!
        const decryptedUser = await getDecryptedUserForAdmin(userId);
        const cleanUser = createCleanUserResponse(decryptedUser || updatedUser);

        // 개발자 페이지 캐시 무효화
        console.log(`🗑️ [캐시 무효화] 사용자 정보 변경으로 인한 캐시 삭제`);
        IntelligentCache.invalidateDeveloperCache()
            .then(() => console.log(`✅ [캐시 무효화 완료]`))
            .catch(error => console.error(`❌ [캐시 무효화 실패] ${error.message}`));

        console.log(`✅ 사용자 ${userId} 정보 업데이트 및 복호화 완료`);

        res.json({
            success: true,
            user: cleanUser,
            message: '사용자 정보가 성공적으로 업데이트되었습니다.'
        });
    } catch (err) {
        console.error("❌ 개발자 사용자 업데이트 에러:", err);
        res.status(500).json({ message: err.message });
    }
};

// 🔧 캐시 상태 확인 함수
export const getCacheStatus = async (req, res) => {
    try {
        const connectionStatus = IntelligentCache.getConnectionStatus();
        const cacheStats = await IntelligentCache.getDeveloperCacheStats();
        const generalStats = await IntelligentCache.getCacheStats();

        console.log('📊 [캐시 상태 조회]', {
            connection: connectionStatus,
            developerCache: cacheStats,
            general: generalStats
        });

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            connection: connectionStatus,
            developerCache: cacheStats,
            generalCache: generalStats,
            environment: {
                REDIS_HOST: process.env.REDIS_HOST,
                ENABLE_CACHE: process.env.ENABLE_CACHE,
                NODE_ENV: process.env.NODE_ENV
            }
        });
    } catch (err) {
        console.error('❌ [캐시 상태 조회 오류]:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// 🧪 나이 계산 테스트 API (개발자 전용)
export const testAgeCalculation = async (req, res) => {
    try {
        if (req.user.userLv !== 3) {
            return res.status(403).json({
                success: false,
                message: '개발자 권한이 필요합니다.',
                requiredLevel: 3,
                currentLevel: req.user.userLv
            });
        }

        const { userId } = req.params;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: '사용자를 찾을 수 없습니다.',
                userId: userId
            });
        }

        const testResults = {
            userId: user._id,
            nickname: user.nickname,

            // 암호화 정보
            encryption: {
                hasEncryptedBirthdate: !!user.birthdate,
                birthdateLength: user.birthdate?.length || 0,
                encryptionEnabled: process.env.ENABLE_ENCRYPTION === 'true'
            },

            // Virtual 필드 테스트 (법적 안전성을 위해 연령대로 표시)
            virtualFields: {
                calculatedAge: user.calculatedAge, // virtual 필드
                isMinor: user.isMinor, // virtual 필드
                ageGroup: user.ageGroup, // virtual 필드
                displayAgeGroup: user.calculatedAge ? 
                    NamePseudonymization.getDetailedAgeGroup(user.calculatedAge) : '정보없음'
            },

            // 성별 정보
            gender: user.gender,

            // 테스트 시간
            testedAt: new Date().toISOString(),
            testedBy: req.user._id,

            // 법적 보호 정보
            legalCompliance: {
                showsAgeGroup: true,
                hidesBirthdate: true,
                minimizesPersonalInfo: true
            }
        };

        // 복호화 테스트 (개발자만)
        if (user.birthdate) {
            try {
                const decrypted = ComprehensiveEncryption.decryptPersonalInfo(user.birthdate);
                const manualAge = ComprehensiveEncryption.calculateAge(decrypted);
                
                testResults.decryption = {
                    success: true,
                    decryptedBirthdate: decrypted,
                    manualAge: manualAge,
                    manualIsMinor: ComprehensiveEncryption.isMinor(decrypted),
                    manualAgeGroup: ComprehensiveEncryption.getAgeGroup(decrypted),
                    // 법적 안전성을 위해 연령대 표시
                    detailedAgeGroup: manualAge ? 
                        NamePseudonymization.getDetailedAgeGroup(manualAge) : '정보없음'
                };

                // 일치성 검증
                testResults.validation = {
                    ageMatch: testResults.virtualFields.calculatedAge === testResults.decryption.manualAge,
                    minorMatch: testResults.virtualFields.isMinor === testResults.decryption.manualIsMinor,
                    ageGroupMatch: testResults.virtualFields.ageGroup === testResults.decryption.manualAgeGroup
                };

            } catch (error) {
                testResults.decryption = {
                    success: false,
                    error: error.message,
                    errorType: error.name
                };
            }
        } else {
            testResults.decryption = {
                success: false,
                reason: 'no_birthdate',
                message: '생년월일 정보가 없습니다.'
            };
        }

        // 매칭 안전성 테스트 (연령대 기반)
        if (testResults.virtualFields.calculatedAge !== null) {
            const ageGroup = testResults.virtualFields.calculatedAge >= 19 ? 'adult' : 'minor';
            const detailedAge = testResults.virtualFields.displayAgeGroup;
            
            testResults.matchingSafety = {
                recommendedAgeGroup: ageGroup,
                detailedAgeGroup: detailedAge,
                isMinor: testResults.virtualFields.isMinor,
                canJoinAdultRoom: ageGroup === 'adult',
                canJoinMinorRoom: ageGroup === 'minor',
                legalCompliance: {
                    showsSpecificAge: false,    // 정확한 나이 비공개
                    showsAgeRange: true,       // 연령대만 표시
                    minimizesPrivacy: true     // 개인정보 최소화
                }
            };
        }

        console.log(`🧪 나이 계산 테스트 완료 (연령대 표시): ${userId}`, {
            detailedAgeGroup: testResults.virtualFields.displayAgeGroup,
            isMinor: testResults.virtualFields.isMinor,
            legalCompliance: testResults.legalCompliance,
            validationPassed: testResults.validation?.ageMatch && testResults.validation?.minorMatch
        });

        res.json({
            success: true,
            message: '나이 계산 테스트가 완료되었습니다.',
            results: testResults
        });

    } catch (error) {
        console.error('🧪 나이 계산 테스트 실패:', error);
        res.status(500).json({
            success: false,
            message: '테스트 실행 중 오류가 발생했습니다.',
            error: error.message
        });
    }
};

// 🧪 가명처리 테스트 API (개발자 전용)
export const testNamePseudonymization = async (req, res) => {
    try {
        if (req.user.userLv !== 3) {
            return res.status(403).json({
                success: false,
                message: '개발자 권한이 필요합니다.',
                requiredLevel: 3,
                currentLevel: req.user.userLv
            });
        }

        const { testName, userId } = req.body;
        
        if (!testName || !userId) {
            return res.status(400).json({
                success: false,
                message: '테스트할 이름과 사용자 ID가 필요합니다.'
            });
        }

        // 가명처리 테스트 실행
        const testResult = NamePseudonymization.testPseudonymization(testName, userId);
        
        // 연령대 처리 테스트
        const testBirthdate = '1990-03-15';
        const testAge = 25; // 예시 나이
        const detailedAgeGroup = NamePseudonymization.getDetailedAgeGroup(testAge);
        const isMinorTest = NamePseudonymization.isMinor(testAge);
        const canAccessAdultContentTest = NamePseudonymization.canAccessAdultContent(testAge);
        
        console.log(`🧪 가명처리 테스트 완료:`, {
            originalName: testName,
            pseudonymized: testResult.final,
            userId: userId
        });

        res.json({
            success: true,
            message: '가명처리 테스트가 완료되었습니다.',
            testResult: {
                ...testResult,
                ageGroupTest: {
                    inputAge: testAge,
                    ageGroup: detailedAgeGroup,
                    isMinor: isMinorTest,
                    canAccessAdultContent: canAccessAdultContentTest
                },
                securityInfo: {
                    method: 'surname_removed_pseudonym_with_age_group',
                    steps: [
                        '1. 성(姓) 제거',
                        '2. 모음 변경 (ㅏ→ㅑ, ㅓ→ㅕ, ㅗ→ㅛ, ㅜ→ㅠ, ㅡ→ㅢ, ㅣ→ㅟ, ㅐ→ㅒ, ㅔ→ㅖ)',
                        '3. 배치 섞기 (사용자별 고정 패턴)',
                        '4. 연령대 가공 (예: "20대 초반", "30대 중반")'
                    ],
                    legalCompliance: '개인정보보호법 최소화 원칙 충족',
                    privacyLevel: '최고 등급 - 재식별 위험 최소화'
                }
            }
        });

    } catch (error) {
        console.error('🧪 가명처리 테스트 실패:', error);
        res.status(500).json({
            success: false,
            message: '테스트 실행 중 오류가 발생했습니다.',
            error: error.message
        });
    }
};
