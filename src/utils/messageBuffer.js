import redis from '../config/redis.js';
import { ChatMessage } from '../models/chat.js';

/**
 * 메시지 버퍼링 시스템
 * - Redis에 메시지를 임시 저장
 * - 2초마다 또는 100개 쌓이면 Bulk Write
 */
class MessageBuffer {
    constructor() {
        this.bufferKey = 'message_buffer';
        this.batchSize = 100;  // 100개 쌓이면 즉시 저장
        this.interval = 2000;  // 2초마다 저장
        this.hasMessages = false;  // ✅ 추가: 메시지 존재 플래그

        // 백그라운드 Worker 시작
        this.startWorker();
    }

    /**
     * 메시지를 Redis 버퍼에 추가
     */
    async addMessage(messageData) {
        try {
            // Redis List에 메시지 추가 (RPUSH)
            await redis.rPush(
                this.bufferKey,
                JSON.stringify(messageData)
            );
            this.hasMessages = true;    // 플래그 ON

            // 버퍼 크기 확인
            const bufferSize = await redis.lLen(this.bufferKey);

            // 100개 쌓이면 즉시 flush
            if (bufferSize >= this.batchSize) {
                console.log(`🔥 [버퍼] 크기 ${bufferSize}개 → 즉시 Flush`);
                await this.flush();
            }

            return { success: true, buffered: true };

        } catch (error) {
            console.error('❌ [버퍼] 추가 실패:', error);

            // Redis 실패 시 즉시 DB에 저장 (Fallback)
            const message = new ChatMessage(messageData);
            await message.save();

            return { success: true, buffered: false, fallback: true };
        }
    }

    /**
     * 버퍼를 MongoDB로 Bulk Write
     */
    async flush() {
        //  메시지 없으면 즉시 종료
        if (!this.hasMessages) {
            return;
        }

        const startTime = Date.now();

        try {
            // Redis에서 모든 메시지 가져오기 (LRANGE + DELETE)
            const messages = [];
            const batchCount = 100;

            while (true) {
                // 100개씩 가져오기
                const batch = await redis.lRange(
                    this.bufferKey,
                    0,
                    batchCount - 1
                );

                if (batch.length === 0) break;

                // JSON 파싱
                messages.push(...batch.map(msg => JSON.parse(msg)));

                // Redis에서 제거
                await redis.lTrim(this.bufferKey, batchCount, -1);

                if (batch.length < batchCount) break;
            }

            if (messages.length === 0) {
                this.hasMessages = false;       // 플래그 OFF
                // console.log('📭 [버퍼] 비어있음, skip');
                return;
            }

            // MongoDB Bulk Write
            const result = await ChatMessage.insertMany(messages, {
                ordered: false,  // 일부 실패해도 계속 진행
                rawResult: true
            });

            const elapsed = Date.now() - startTime;

            console.log(`✅ [버퍼] Flush 완료: ${messages.length}개 → ${elapsed}ms`);
            console.log(`   - 저장: ${result.insertedCount}개`);
            console.log(`   - 실패: ${messages.length - result.insertedCount}개`);

            this.hasMessages = false;
            return result;

        } catch (error) {
            console.error('❌ [버퍼] Flush 실패:', error);
            throw error;
        }
    }

    /**
     * 백그라운드 Worker 시작
     */
    startWorker() {
        console.log('🚀 [버퍼] Worker 시작 (2초마다)');

        setInterval(async () => {
            try {
                await this.flush();
            } catch (error) {
                console.error('❌ [버퍼] Worker 오류:', error);
            }
        }, this.interval);
    }

    /**
     * 서버 종료 시 남은 메시지 저장
     */
    async shutdown() {
        console.log('⏹️ [버퍼] 종료 - 남은 메시지 저장 중...');
        await this.flush();
        console.log('✅ [버퍼] 종료 완료');
    }
}

// Singleton 인스턴스
export default new MessageBuffer();