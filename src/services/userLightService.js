// ============================================================================
// 경량 사용자 정보 조회 서비스
// 목적: 필요한 필드만 조회하여 성능 최적화
// ============================================================================

import { User } from '../models/UserProfile.js';
import { ChatRoom } from '../models/chat.js';
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
            throw new Error('Riot ID가 설정되지 않았습니다.');
        }

        // lolNickname을 '#' 기준으로 분리하여 가상 필드 로직을 수동으로 구현
        const parts = user.lolNickname.split('#');
        const riotGameName = parts[0];
        const riotTagLine = parts[1] || ''; // 태그라인이 없는 경우 기본값 처리

        const result = {
            riotGameName,
            riotTagLine
        };

        // riotGameName이 없는 경우(비정상적인 데이터) 에러 처리
        if (!result.riotGameName) {
            throw new Error('Riot ID 형식이 올바르지 않습니다.');
        }

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
 * @returns {Promise<{_id}>} 성공 여부만 반환
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

        // 🆕 친구 채팅방 비활성화 (차단 시 필수!)
        const chatRoom = await ChatRoom.findOne({
            roomType: 'friend',
            chatUsers: { $all: [userId, targetId] }
        })
            .select('_id isActive')
            .lean();

        if (chatRoom && chatRoom.isActive) {
            await ChatRoom.updateOne(
                { _id: chatRoom._id },
                { $set: { isActive: false } }
            );
            console.log(`🚫 [차단] 채팅방 비활성화: ${chatRoom._id}`);
        }

        // ✅ 필요한 캐시만 선택적 무효화
        await Promise.all([
            // userId의 캐시 (차단한 사람)
            IntelligentCache.deleteCache(`user:basic:${userId}`),
            IntelligentCache.deleteCache(`user:friend:${userId}`),
            IntelligentCache.deleteCache(`user_blocks_${userId}`),
            IntelligentCache.deleteCache(`user_profile_full_${userId}`),

            // targetId의 캐시 (차단당한 사람)
            IntelligentCache.deleteCache(`user:basic:${targetId}`),
            IntelligentCache.deleteCache(`user:friend:${targetId}`),
            IntelligentCache.deleteCache(`users_blocked_me_${targetId}`),
            IntelligentCache.deleteCache(`user_profile_full_${targetId}`),
            
            // 🆕 친구방 캐시 무효화 (차단 시 필수!)
            IntelligentCache.invalidateFriendRoomId(userId, targetId)
        ]);

        emitFriendBlocked(userId, targetId);

        console.log(`✅ [차단 완료] ${userId} -> ${targetId}`);

        return { _id: targetId };
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

/**
 * 차단 목록 조회 (경량화 버전)
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Array>} 차단된 사용자 목록
 */
export const getBlockedUsersService = async (userId) => {
    try {
        const cacheKey = `user_blocks_${userId}`;
        const cached = await IntelligentCache.getCache(cacheKey);

        if (cached) {
            console.log(`💾 [캐시 HIT] 차단 목록: ${userId}`);
            return cached;
        }
        console.log(`🔍 [캐시 MISS] 차단 목록 DB 조회: ${userId}`);

        const user = await User.findById(userId)
            .populate('blockedUsers', '_id nickname profilePhoto')
            .lean();
            
        if (!user) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }

        const blockedUsers = user.blockedUsers || [];

        // 5분 캐시
        await IntelligentCache.setCache(cacheKey, blockedUsers, 300);
        console.log(`✅ [캐시 저장] 차단 목록: ${cacheKey} (${blockedUsers.length}명)`);

        return blockedUsers;
    } catch (error) {
        console.error(`❌ getBlockedUsersService 에러: ${userId}`, error.message);
        throw error;
    }
};