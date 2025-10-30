// ============================================================================
// 경량 사용자 정보 조회 서비스
// 목적: 필요한 필드만 조회하여 성능 최적화
// ============================================================================

import { User } from '../models/UserProfile.js';
import IntelligentCache from '../utils/cache/intelligentCache.js';
import { emitFriendBlocked, emitFriendUnblocked } from '../socket/socketIO.js';

/**
 * 기본 프로필 정보 조회
 * @param {string} userId - 사용자 ID
 * @returns {Object} { _id, nickname, profilePhoto }
 */
export const getUserBasicProfile = async (userId) => {
    try {
        // 1) 캐시 확인
        const cacheKey = `user:basic:${userId}`;
        const cached = await IntelligentCache.getCache(cacheKey);  // ✅ get → getCache

        if (cached) {
            console.log(`💾 [캐시 HIT] 기본 프로필: ${userId}`);
            return cached;
        }

        console.log(`🔍 [캐시 MISS] 기본 프로필 DB 조회: ${userId}`);

        // 2) DB 조회 - 3개 필드만
        const user = await User.findById(userId)
            .select('_id nickname profilePhoto')
            .lean();

        if (!user) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }

        // 3) 캐시 저장 (30분)
        await IntelligentCache.setCache(cacheKey, user, 1800);  // ✅ set → setCache

        return user;
    } catch (error) {
        console.error(`❌ getUserBasicProfile 에러: ${userId}`, error.message);
        throw error;
    }
};

/**
 * Riot ID 정보 조회
 * @param {string} userId - 사용자 ID
 * @returns {Object} { riotGameName, riotTagLine }
 */
export const getUserRiotInfo = async (userId) => {
    try {
        // 1) 캐시 확인
        const cacheKey = `user:riot:${userId}`;
        const cached = await IntelligentCache.getCache(cacheKey);  // ✅ get → getCache

        if (cached) {
            console.log(`💾 [캐시 HIT] Riot 정보: ${userId}`);
            return cached;
        }

        console.log(`🔍 [캐시 MISS] Riot 정보 DB 조회: ${userId}`);

        // 2) DB 조회 - 2개 필드만
        const user = await User.findById(userId)
            .select('lolNickname') // 실제 저장된 필드 조회
            .lean();

        if (!user || !user.lolNickname) {
            console.log(user?.riotGameName, user?.riotTagLine);
            throw new Error('Riot ID가 설정되지 않았습니다.');
        }

        // ✅ 가상 필드가 포함된 객체 생성
        const result = {
            riotGameName: user.riotGameName,
            riotTagLine: user.riotTagLine
        };

        await IntelligentCache.setCache(cacheKey, result, 3600);
        return result;
    } catch (error) {
        console.error(`❌ getUserRiotInfo 에러: ${userId}`, error.message);
        throw error;
    }
};


/**
 * 닉네임만 조회
 * @param {string} userId - 사용자 ID
 * @returns {Object} { nickname }
 */
export const getUserNickname = async (userId) => {
    try {
        // 1) 캐시 확인
        const cacheKey = `user:nickname:${userId}`;
        const cached = await IntelligentCache.getCache(cacheKey);  // ✅ get → getCache

        if (cached) {
            console.log(`💾 [캐시 HIT] 닉네임: ${userId}`);
            return cached;
        }

        console.log(`🔍 [캐시 MISS] 닉네임 DB 조회: ${userId}`);

        // 2) DB 조회 - 1개 필드만
        const user = await User.findById(userId)
            .select('nickname')
            .lean();

        if (!user) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }

        // 3) 캐시 저장 (10분 - 변경 가능성 있음)
        await IntelligentCache.setCache(cacheKey, user, 600);  // ✅ set → setCache

        return user;
    } catch (error) {
        console.error(`❌ getUserNickname 에러: ${userId}`, error.message);
        throw error;
    }
};

/**
 * 친구 프로필 정보 조회
 * @param {string} userId - 사용자 ID
 * @returns {Object} { _id, nickname, profilePhoto, star, gender }
 */
export const getUserFriendProfile = async (userId) => {
    try {
        // 1) 캐시 확인
        const cacheKey = `user:friend:${userId}`;
        const cached = await IntelligentCache.getCache(cacheKey);  // ✅ get → getCache

        if (cached) {
            console.log(`💾 [캐시 HIT] 친구 프로필: ${userId}`);
            return cached;
        }

        console.log(`🔍 [캐시 MISS] 친구 프로필 DB 조회: ${userId}`);

        // 2) DB 조회 - 친구 목록에 필요한 필드들
        const user = await User.findById(userId)
            .select('_id nickname profilePhoto star gender')
            .lean();

        if (!user) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }

        // 3) 온라인 상태 추가 (선택사항)
        // const isOnline = await onlineStatusService.isUserOnline(userId);
        // user.isOnline = isOnline;

        // 4) 캐시 저장 (20분)
        await IntelligentCache.setCache(cacheKey, user, 1200);  // ✅ set → setCache

        return user;
    } catch (error) {
        console.error(`❌ getUserFriendProfile 에러: ${userId}`, error.message);
        throw error;
    }
};


/**
 * 사용자 차단 (최소 응답 버전)
 * @returns {Promise<boolean>} 성공 여부만 반환
 */
export const blockUserServiceMinimal = async (userId, targetId) => {
    try {
        // DB 업데이트 ($addToSet: 중복 방지)
        const result = await User.updateOne(
            { _id: userId },
            { $addToSet: { blockedUsers: targetId },
                     $pull: { friends: targetId }
            }
        );

        if (result.matchedCount === 0) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }

        // ✅ 2단계: 차단당하는 사람의 친구 목록에서 나를 제거
        await User.updateOne(
            { _id: targetId },
            { $pull: { friends: userId } }  // ⭐ 이 줄 추가!
        );

        // 🆕 차단된 사용자 정보 조회 (필요한 필드만!)
        const blockedUser = await User.findById(targetId)
            .select('_id nickname profilePhoto name createdAt')
            .lean();

        if (!blockedUser) {
            throw new Error('차단할 사용자를 찾을 수 없습니다.');
        }


        // 캐시 무효화
        await IntelligentCache.invalidateUserCache(userId);
        await IntelligentCache.invalidateUserCache(targetId);
        await IntelligentCache.deleteCache(`user_blocks_${userId}`);
        await IntelligentCache.deleteCache(`users_blocked_me_${targetId}`);

        emitFriendBlocked(userId, targetId);

        console.log(`✅ [차단 완료] ${userId} -> ${targetId}`);

        return true;
    } catch (error) {
        console.error('❌ [차단 실패]:', error);
        throw error;
    }
};

/**
 * 차단 해제 (최소 응답 버전)
 * @returns {Promise<boolean>} 성공 여부만 반환
 */
export const unblockUserServiceMinimal = async (userId, targetId) => {
    try {
        // DB 업데이트 ($pull: 배열에서 제거)
        const result = await User.updateOne(
            { _id: userId },
            { $pull: { blockedUsers: targetId } }
        );

        if (result.matchedCount === 0) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }

        // 캐시 무효화
        await IntelligentCache.invalidateUserCache(userId);
        await IntelligentCache.deleteCache(`user_blocks_${userId}`);
        await IntelligentCache.deleteCache(`users_blocked_me_${targetId}`);

        emitFriendUnblocked(userId, targetId);

        console.log(`✅ [차단 해제] ${userId} -> ${targetId}`);

        return true;
    } catch (error) {
        console.error('❌ [차단 해제 실패]:', error);
        throw error;
    }
};