import IntelligentCache from '../utils/cache/intelligentCache.js';
/**
 * 사용자 온라인 상태 관리 서비스
 * 메모리 기반으로 빠른 조회와 업데이트를 지원
 */

// 온라인 사용자 상태 저장소 redis로 변경
//const onlineUsers = new Map(); // userId -> { socketId, lastSeen, isOnline }

const ONLINE_PREFIX = 'online:';
const ONLINE_TTL = 180; // 1시간
/**
 * 사용자 온라인 상태 설정
 * @param {string} userId - 사용자 ID
 * @param {string} socketId - 소켓 ID
 * @param {boolean} isOnline - 온라인 여부
 */
export const setUserOnlineStatus = async (userId, socketId, isOnline) => {
    if (!userId) {
        console.warn('setUserOnlineStatus: 유효하지 않은 userId:', userId);
        return;
    }

    const key = `${ONLINE_PREFIX}${userId}`;

    try {
        if (isOnline) {
            const data = {
                socketId: socketId || '',
                lastSeen: new Date().toISOString(),
                isOnline: 'true'
            };
            await IntelligentCache.setCache(key, data, ONLINE_TTL);
            console.log(`🟢 [Redis] 사용자 온라인: ${userId}`);
        } else {
            await IntelligentCache.deleteCache(key);
            console.log(`🔴 [Redis] 사용자 오프라인: ${userId}`);
        }
    } catch (error) {
        console.error(`❌ [Redis] 온라인 상태 설정 실패:`, error.message);
    }
};

/**
 * 사용자 온라인 상태 조회
 * @param {string} userId - 사용자 ID
 * @returns {boolean} 온라인 여부
 */
export const getUserOnlineStatus = async (userId) => {
    if (!userId) return false;

    const key = `${ONLINE_PREFIX}${userId}`;

    try {
        const data = await IntelligentCache.getCache(key);
        if (!data) return false;
        return data.isOnline === 'true' || data.isOnline === true;
    } catch (error) {
        console.error(`❌ [Redis] 온라인 상태 조회 실패:`, error.message);
        return false;
    }
};

/**
 * 여러 사용자의 온라인 상태 조회
 * @param {string[]} userIds - 사용자 ID 배열
 * @returns {Object} userId -> isOnline 맵
 */
export const getMultipleUserStatus = async (userIds) => {
    if (!userIds || userIds.length === 0) return {};

    const statusMap = {};

    try {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ Redis MGET 사용 (N+1 해결)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (IntelligentCache.client) {
            // Redis 클라이언트가 있으면 MGET 사용
            const keys = userIds.map(id => `${ONLINE_PREFIX}${id}`);
            const values = await IntelligentCache.client.mGet(keys);

            userIds.forEach((userId, index) => {
                const data = values[index] ? JSON.parse(values[index]) : null;
                statusMap[userId] = data?.isOnline === 'true';
            });

            console.log(`✅ [Redis MGET] ${userIds.length}명 조회 (1회)`);

        } else {
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // ⚠️ Memory 캐시 폴백 (기존 로직 유지)
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            const promises = userIds.map(async (userId) => {
                const isOnline = await getUserOnlineStatus(userId);
                return { userId, isOnline };
            });

            const results = await Promise.all(promises);

            results.forEach(({ userId, isOnline }) => {
                statusMap[userId] = isOnline;
            });

            console.log(`✅ [Memory] ${userIds.length}명 조회`);
        }

    } catch (error) {
        console.error('❌ [Redis] 다중 조회 실패:', error.message);
        // 에러 시 모두 오프라인 처리
        userIds.forEach(userId => {
            statusMap[userId] = false;
        });
    }

    return statusMap;
};
/**
 * 모든 온라인 사용자 목록 조회
 * @returns {Promise<string[]>} 온라인 사용자 ID 배열
 */
export const getAllOnlineUsers = async () => {
    try {
        // Redis에서 online:* 패턴의 모든 키 조회
        const keys = await IntelligentCache.scanKeys(`${ONLINE_PREFIX}*`);

        if (!keys || keys.length === 0) {
            return [];
        }

        // online:userId → userId 추출
        const userIds = keys.map(key => key.replace(ONLINE_PREFIX, ''));

        console.log(`✅ [Redis] 온라인 사용자: ${userIds.length}명`);
        return userIds;
    } catch (error) {
        console.error('❌ [Redis] 온라인 사용자 조회 실패:', error.message);
        return [];
    }
};

/**
 * 온라인 상태 통계 (Redis)
 * @returns {Promise<Object>} 통계 정보
 */
export const getOnlineStats = async () => {
    try {
        const onlineUserIds = await getAllOnlineUsers();
        const total = onlineUserIds.length;

        return {
            total: total,
            online: total,
            offline: 0  // Redis에는 온라인만 저장
        };
    } catch (error) {
        console.error('❌ [Redis] 통계 조회 실패:', error.message);
        return {
            total: 0,
            online: 0,
            offline: 0
        };
    }
};
