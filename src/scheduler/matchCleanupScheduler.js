// src/scheduler/matchCleanupScheduler.js
// 매치 히스토리 정리 스케줄러 (배치 삭제)

import cron from 'node-cron';
import { LoLRecord } from '../models/riot.js';

/**
 * 매치 히스토리 정리 스케줄러 초기화
 * - 매일 새벽 4시에 실행
 * - 10개 초과된 매치 데이터 삭제
 */
export function initMatchCleanupScheduler() {
    // 매일 04:00에 실행 (KST 기준)
    cron.schedule('0 4 * * *', async () => {
        await cleanupMatches();
    }, {
        timezone: 'Asia/Seoul'
    });

    console.log('✅ [Scheduler] 매치 정리 스케줄러 등록 완료 (매일 04:00 KST)');
}

/**
 * 매치 정리 실행 함수
 * - 10개 초과된 매치를 최신 10개만 유지하도록 정리
 */
export async function cleanupMatches() {
    console.log('🧹 [Scheduler] 매치 히스토리 정리 시작...');
    const startTime = Date.now();

    try {
        // 10개 초과된 문서만 대상으로 업데이트
        // matches.10이 존재한다는 것은 11개 이상이라는 의미
        const result = await LoLRecord.updateMany(
            { 'matches.10': { $exists: true } },
            [
                {
                    $set: {
                        matches: { $slice: ['$matches', 10] } // 앞에서 10개만 유지
                    }
                }
            ]
        );

        const elapsed = Date.now() - startTime;

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ [Scheduler] 매치 정리 완료`);
        console.log(`   - 대상: ${result.matchedCount}개 문서`);
        console.log(`   - 수정: ${result.modifiedCount}개 문서`);
        console.log(`   - 소요: ${elapsed}ms`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        return {
            success: true,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
            elapsed
        };
    } catch (error) {
        console.error('❌ [Scheduler] 매치 정리 실패:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 수동 정리 함수 (관리자 API용)
 */
export async function manualCleanup() {
    console.log('🔧 [Manual] 매치 히스토리 수동 정리 시작...');
    return await cleanupMatches();
}

/**
 * 오래된 레코드 삭제 (선택적)
 * - 90일 이상 갱신되지 않은 레코드 삭제
 */
export async function cleanupOldRecords(daysOld = 90) {
    console.log(`🧹 [Scheduler] ${daysOld}일 이상 오래된 레코드 정리 시작...`);

    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const result = await LoLRecord.deleteMany({
            lastUpdatedAt: { $lt: cutoffDate }
        });

        console.log(`✅ [Scheduler] 오래된 레코드 ${result.deletedCount}개 삭제 완료`);

        return {
            success: true,
            deletedCount: result.deletedCount
        };
    } catch (error) {
        console.error('❌ [Scheduler] 오래된 레코드 정리 실패:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}
