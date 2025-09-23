// src/utils/cache/friendCache.js (신규 파일 생성)
import IntelligentCache from './intelligentCache.js';
import { User } from '../../models/UserProfile.js';

/**
 * 친구 관계 전용 캐싱 시스템
 * 비용 효율적이고 높은 히트율을 위한 선별적 캐싱
 */
class FriendCache extends IntelligentCache {
    constructor() {
        super();
        this.FRIEND_LIST_TTL = 30 * 60; // 30분
        this.BLOCKED_LIST_TTL = 30 * 60; // 30분  
        this.USER_SETTINGS_TTL = 60 * 60; // 1시간
        this.ACTIVE_ROOMS_TTL = 10 * 60; // 10분
    }

    // ============================================================================
    //   친구 목록 캐싱 (최고 우선순위 - 히트율 90%+)
    // ============================================================================

    /**
     * 친구 목록 캐시에서 조회
     * @param {string} userId - 사용자 ID
     * @returns {Array|null} 친구 목록 또는 null
     */
    async getFriendList(userId) {
        try {
            const cacheKey = `friends:${userId}`;
            
            if (this.client && this.isConnected) {
                const cached = await this.client.get(cacheKey);
                if (cached) {
                    console.log(`[친구캐시] 히트: ${userId}`);
                    return JSON.parse(cached);
                }
            } else {
                const memCached = this.memoryCache.get(cacheKey);
                if (memCached) {
                    console.log(`[친구메모리] 히트: ${userId}`);
                    return memCached;
                }
            }
            
            console.log(`[친구캐시] 미스: ${userId}`);
            return null;
        } catch (error) {
            console.error('[친구캐시] 조회 실패:', error);
            return null;
        }
    }

    /**
     * 친구 목록 캐시에 저장
     * @param {string} userId - 사용자 ID
     * @param {Array} friends - 친구 목록
     */
    async cacheFriendList(userId, friends) {
        try {
            const cacheKey = `friends:${userId}`;
            const friendData = {
                friends: friends,
                cachedAt: new Date().toISOString(),
                count: friends.length
            };

            if (this.client && this.isConnected) {
                await this.client.setEx(
                    cacheKey,
                    this.FRIEND_LIST_TTL,
                    JSON.stringify(friendData)
                );
                console.log(`[친구캐시] 저장: ${userId} (${friends.length}명)`);
            } else {
                this.memoryCache.set(cacheKey, friendData);
                setTimeout(() => {
                    this.memoryCache.delete(cacheKey);
                }, this.FRIEND_LIST_TTL * 1000);
                console.log(`[친구메모리] 저장: ${userId} (${friends.length}명)`);
            }
        } catch (error) {
            console.error('[친구캐시] 저장 실패:', error);
        }
    }

    // ============================================================================
    //   차단 목록 캐싱 (높은 우선순위 - 안전성 중요)
    // ============================================================================

    /**
     * 차단 목록 캐시에서 조회
     * @param {string} userId - 사용자 ID
     * @returns {Array|null} 차단 목록 또는 null
     */
    async getBlockedList(userId) {
        try {
            const cacheKey = `blocked:${userId}`;
            
            if (this.client && this.isConnected) {
                const cached = await this.client.get(cacheKey);
                if (cached) {
                    console.log(`[차단캐시] 히트: ${userId}`);
                    return JSON.parse(cached);
                }
            } else {
                const memCached = this.memoryCache.get(cacheKey);
                if (memCached) {
                    console.log(`[차단메모리] 히트: ${userId}`);
                    return memCached;
                }
            }
            
            return null;
        } catch (error) {
            console.error('[차단캐시] 조회 실패:', error);
            return null;
        }
    }

    /**
     * 차단 목록 캐시에 저장
     * @param {string} userId - 사용자 ID
     * @param {Array} blockedUsers - 차단된 사용자 목록
     */
    async cacheBlockedList(userId, blockedUsers) {
        try {
            const cacheKey = `blocked:${userId}`;
            const blockedData = {
                blockedUsers: blockedUsers,
                cachedAt: new Date().toISOString(),
                count: blockedUsers.length
            };

            if (this.client && this.isConnected) {
                await this.client.setEx(
                    cacheKey,
                    this.BLOCKED_LIST_TTL,
                    JSON.stringify(blockedData)
                );
            } else {
                this.memoryCache.set(cacheKey, blockedData);
                setTimeout(() => {
                    this.memoryCache.delete(cacheKey);
                }, this.BLOCKED_LIST_TTL * 1000);
            }
            
            console.log(`[차단캐시] 저장: ${userId} (${blockedUsers.length}명)`);
        } catch (error) {
            console.error('[차단캐시] 저장 실패:', error);
        }
    }

    /**
     * 두 사용자 간 차단 관계 확인 (고속)
     * @param {string} userId1 - 사용자1 ID
     * @param {string} userId2 - 사용자2 ID
     * @returns {boolean} 차단 관계 여부
     */
    async isBlocked(userId1, userId2) {
        try {
            // 양방향 차단 확인
            const [blocked1, blocked2] = await Promise.all([
                this.getBlockedList(userId1),
                this.getBlockedList(userId2)
            ]);

            if (blocked1?.blockedUsers?.includes(userId2)) return true;
            if (blocked2?.blockedUsers?.includes(userId1)) return true;
            
            return false;
        } catch (error) {
            console.error('[차단확인] 실패:', error);
            return false; // 안전을 위해 false 반환
        }
    }

    // ============================================================================
    //   사용자 설정 캐싱 (매칭 옵션, 권한 등)
    // ============================================================================

    /**
     * 사용자 기본 설정 캐시 조회
     * @param {string} userId - 사용자 ID
     * @returns {Object|null} 설정 객체 또는 null
     */
    async getUserSettings(userId) {
        try {
            const cacheKey = `settings:${userId}`;
            
            if (this.client && this.isConnected) {
                const cached = await this.client.get(cacheKey);
                if (cached) {
                    console.log(`[설정캐시] 히트: ${userId}`);
                    return JSON.parse(cached);
                }
            } else {
                const memCached = this.memoryCache.get(cacheKey);
                if (memCached) {
                    return memCached;
                }
            }
            
            return null;
        } catch (error) {
            console.error('[설정캐시] 조회 실패:', error);
            return null;
        }
    }

    /**
     * 사용자 설정 캐시에 저장
     * @param {string} userId - 사용자 ID
     * @param {Object} settings - 설정 객체
     */
    async cacheUserSettings(userId, settings) {
        try {
            const cacheKey = `settings:${userId}`;
            const settingsData = {
                ...settings,
                cachedAt: new Date().toISOString()
            };

            if (this.client && this.isConnected) {
                await this.client.setEx(
                    cacheKey,
                    this.USER_SETTINGS_TTL,
                    JSON.stringify(settingsData)
                );
            } else {
                this.memoryCache.set(cacheKey, settingsData);
                setTimeout(() => {
                    this.memoryCache.delete(cacheKey);
                }, this.USER_SETTINGS_TTL * 1000);
            }
            
            console.log(`[설정캐시] 저장: ${userId}`);
        } catch (error) {
            console.error('[설정캐시] 저장 실패:', error);
        }
    }

    // ============================================================================
    //   캐시 무효화 및 관리
    // ============================================================================

    /**
     * 친구 관계 변경 시 양방향 캐시 무효화
     * @param {string} userId1 - 사용자1 ID
     * @param {string} userId2 - 사용자2 ID
     */
    async invalidateFriendRelation(userId1, userId2) {
        try {
            const keysToDelete = [
                `friends:${userId1}`,
                `friends:${userId2}`
            ];

            if (this.client && this.isConnected) {
                await this.client.del(keysToDelete);
                console.log(`[캐시무효화] 친구관계: ${userId1} ↔ ${userId2}`);
            } else {
                keysToDelete.forEach(key => this.memoryCache.delete(key));
            }
        } catch (error) {
            console.error('[캐시무효화] 실패:', error);
        }
    }

    /**
     * 차단 관계 변경 시 양방향 캐시 무효화
     * @param {string} userId1 - 사용자1 ID
     * @param {string} userId2 - 사용자2 ID
     */
    async invalidateBlockRelation(userId1, userId2) {
        try {
            const keysToDelete = [
                `blocked:${userId1}`,
                `blocked:${userId2}`,
                `friends:${userId1}`, // 차단 시 친구 목록도 갱신 필요
                `friends:${userId2}`
            ];

            if (this.client && this.isConnected) {
                await this.client.del(keysToDelete);
                console.log(`[캐시무효화] 차단관계: ${userId1} ↔ ${userId2}`);
            } else {
                keysToDelete.forEach(key => this.memoryCache.delete(key));
            }
        } catch (error) {
            console.error('[캐시무효화] 실패:', error);
        }
    }

    /**
     * 사용자 설정 변경 시 캐시 무효화
     * @param {string} userId - 사용자 ID
     */
    async invalidateUserSettings(userId) {
        try {
            const keyToDelete = `settings:${userId}`;

            if (this.client && this.isConnected) {
                await this.client.del(keyToDelete);
            } else {
                this.memoryCache.delete(keyToDelete);
            }
            
            console.log(`[캐시무효화] 사용자설정: ${userId}`);
        } catch (error) {
            console.error('[캐시무효화] 실패:', error);
        }
    }

    // ============================================================================
    //   캐시 통계 및 모니터링
    // ============================================================================

    /**
     * 친구 관계 캐시 통계 조회
     */
    async getFriendCacheStats() {
        try {
            const stats = {
                timestamp: new Date().toISOString(),
                redis: {
                    connected: this.isConnected,
                    friendLists: 0,
                    blockedLists: 0, 
                    userSettings: 0
                },
                memory: {
                    totalKeys: this.memoryCache.size,
                    estimatedMemory: `${Math.round(JSON.stringify([...this.memoryCache.values()]).length / 1024)}KB`
                }
            };

            if (this.client && this.isConnected) {
                // Redis 키 패턴별 개수 조회
                const [friendKeys, blockedKeys, settingKeys] = await Promise.all([
                    this.client.keys('friends:*'),
                    this.client.keys('blocked:*'),
                    this.client.keys('settings:*')
                ]);

                stats.redis.friendLists = friendKeys.length;
                stats.redis.blockedLists = blockedKeys.length;
                stats.redis.userSettings = settingKeys.length;
            }

            return stats;
        } catch (error) {
            console.error('[캐시통계] 조회 실패:', error);
            return null;
        }
    }
}

// 싱글톤 인스턴스 생성
const friendCache = new FriendCache();

export default friendCache;