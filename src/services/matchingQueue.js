// 랜덤채팅방 매치 큐 임 아직 적용 안함 동접 5000명 이상일때 할걷임

import redis from '../config/redis.js';  // ✅ 기존 Redis 재사용
import { ChatRoom } from '../models/chat.js';
import { User } from '../models/UserProfile.js';

/**
 * Redis 기반 매칭 대기열 시스템
 */
class MatchingQueue {
    constructor() {
        this.isRunning = false;
        this.workerInterval = null;
    }

    /**
     * 대기열 키 생성
     * @returns {string} Redis 키 (예: matching_queue:adult:any)
     */
    getQueueKey(ageGroup, matchedGender) {
        return `matching_queue:${ageGroup}:${matchedGender}`;
    }

    /**
     * 매칭 대기열에 사용자 추가
     */
    async addToQueue(userId, preferences) {
        try {
            const { ageGroup, matchedGender, capacity = 2 } = preferences;

            // 1. 이미 대기 중인지 확인
            const isWaiting = await this.isUserInQueue(userId);
            if (isWaiting) {
                return {
                    success: false,
                    reason: 'ALREADY_IN_QUEUE',
                    message: '이미 대기열에 있습니다.'
                };
            }

            // 2. 사용자 정보 조회
            const user = await User.findById(userId)
                .select('blockedUsers gender')
                .lean();

            if (!user) {
                throw new Error('사용자를 찾을 수 없습니다.');
            }

            // 3. 대기열 키 생성
            const queueKey = this.getQueueKey(ageGroup, matchedGender);

            // 4. 사용자 데이터 생성
            const queueData = {
                userId: userId,
                gender: user.gender,
                blockedUsers: user.blockedUsers?.map(id => id.toString()) || [],
                ageGroup: ageGroup,
                matchedGender: matchedGender,
                capacity: capacity,
                timestamp: Date.now()
            };

            // 5. Redis List에 추가
            await redis.rpush(queueKey, JSON.stringify(queueData));

            // 6. 대기열 크기
            const queueSize = await redis.llen(queueKey);

            console.log(`✅ [매칭큐] ${userId} 추가 → ${queueKey} (대기: ${queueSize}명)`);

            return {
                success: true,
                queueKey: queueKey,
                queueSize: queueSize,
                position: queueSize
            };

        } catch (error) {
            console.error('❌ [매칭큐] 추가 실패:', error);
            throw error;
        }
    }

    /**
     * 사용자가 대기열에 있는지 확인
     */
    async isUserInQueue(userId) {
        try {
            const keys = await redis.keys('matching_queue:*');

            for (const key of keys) {
                const queueData = await redis.lrange(key, 0, -1);

                for (const data of queueData) {
                    const parsed = JSON.parse(data);
                    if (parsed.userId === userId) {
                        return true;
                    }
                }
            }

            return false;
        } catch (error) {
            console.error('❌ [매칭큐] 확인 실패:', error);
            return false;
        }
    }

    /**
     * 대기열에서 사용자 제거
     */
    async removeFromQueue(userId) {
        try {
            const keys = await redis.keys('matching_queue:*');

            for (const key of keys) {
                const queueData = await redis.lrange(key, 0, -1);

                for (let i = 0; i < queueData.length; i++) {
                    const parsed = JSON.parse(queueData[i]);
                    if (parsed.userId === userId) {
                        await redis.lrem(key, 0, queueData[i]);
                        console.log(`🗑️ [매칭큐] ${userId} 제거 (${key})`);
                        return true;
                    }
                }
            }

            return false;
        } catch (error) {
            console.error('❌ [매칭큐] 제거 실패:', error);
            throw error;
        }
    }

    /**
     * 백그라운드 매칭 워커 시작
     */
    startWorker() {
        if (this.isRunning) {
            console.log('⚠️ [매칭워커] 이미 실행 중');
            return;
        }

        this.isRunning = true;
        console.log('🚀 [매칭워커] 시작 (0.1초마다)');

        this.workerInterval = setInterval(async () => {
            try {
                await this.processMatching();
            } catch (error) {
                console.error('❌ [매칭워커] 오류:', error);
            }
        }, 100); // 0.1초마다
    }

    /**
     * 백그라운드 매칭 워커 중지
     */
    stopWorker() {
        if (this.workerInterval) {
            clearInterval(this.workerInterval);
            this.workerInterval = null;
            this.isRunning = false;
            console.log('🛑 [매칭워커] 중지');
        }
    }

    /**
     * 매칭 처리 (핵심 로직)
     */
    async processMatching() {
        try {
            const keys = await redis.keys('matching_queue:*');

            if (keys.length === 0) return;

            for (const key of keys) {
                const queueSize = await redis.llen(key);

                // 2명 이상 있어야 매칭 가능
                if (queueSize < 2) continue;

                // 2명씩 꺼내기
                const user1Data = await redis.lpop(key);
                const user2Data = await redis.lpop(key);

                if (!user1Data || !user2Data) continue;

                const user1 = JSON.parse(user1Data);
                const user2 = JSON.parse(user2Data);

                console.log(`🔄 [매칭워커] ${user1.userId} ↔ ${user2.userId}`);

                // 차단 관계 체크
                const isBlocked =
                    user1.blockedUsers.includes(user2.userId) ||
                    user2.blockedUsers.includes(user1.userId);

                if (isBlocked) {
                    console.log(`🔒 [매칭워커] 차단 관계`);
                    await redis.rpush(key, user1Data);
                    await redis.rpush(key, user2Data);
                    continue;
                }

                // 성별 매칭 체크
                const genderMatch = this.checkGenderMatch(
                    user1.gender,
                    user2.gender,
                    user1.matchedGender
                );

                if (!genderMatch) {
                    console.log(`⚠️ [매칭워커] 성별 불일치`);
                    await redis.rpush(key, user1Data);
                    await redis.rpush(key, user2Data);
                    continue;
                }

                // 매칭 성공 → MongoDB에 방 생성
                try {
                    const room = await ChatRoom.create({
                        roomType: 'random',
                        capacity: 2,
                        chatUsers: [user1.userId, user2.userId],
                        matchedGender: user1.matchedGender,
                        ageGroup: user1.ageGroup,
                        isActive: true,
                        status: 'active'
                    });

                    console.log(`✅ [매칭워커] 성공: ${room._id}`);

                    // Socket.IO 알림
                    const { io } = await import('../socket/socketIO.js');

                    io.to(user1.userId).emit('matchingSuccess', {
                        roomId: room._id,
                        partnerId: user2.userId
                    });

                    io.to(user2.userId).emit('matchingSuccess', {
                        roomId: room._id,
                        partnerId: user1.userId
                    });

                } catch (createError) {
                    console.error('❌ [매칭워커] 방 생성 실패:', createError);
                    await redis.rpush(key, user1Data);
                    await redis.rpush(key, user2Data);
                }
            }

        } catch (error) {
            console.error('❌ [매칭워커] 오류:', error);
        }
    }

    /**
     * 성별 매칭 확인
     */
    checkGenderMatch(gender1, gender2, preference) {
        if (preference === 'any') return true;
        if (preference === 'opposite') return gender1 !== gender2;
        if (preference === 'same') return gender1 === gender2;
        return false;
    }

    /**
     * 대기열 통계 조회
     */
    async getQueueStats() {
        try {
            const keys = await redis.keys('matching_queue:*');
            const stats = {};

            for (const key of keys) {
                const size = await redis.llen(key);
                stats[key] = size;
            }

            return {
                totalQueues: keys.length,
                queues: stats,
                totalWaiting: Object.values(stats).reduce((sum, cnt) => sum + cnt, 0)
            };
        } catch (error) {
            console.error('❌ [매칭큐] 통계 실패:', error);
            return { totalQueues: 0, queues: {}, totalWaiting: 0 };
        }
    }
}

// Singleton 생성
const matchingQueue = new MatchingQueue();

// 서버 시작 시 워커 자동 시작
matchingQueue.startWorker();

export default matchingQueue;