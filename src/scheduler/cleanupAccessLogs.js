// src/scheduler/cleanupAccessLogs.js
import cron from 'node-cron';
import mongoose from 'mongoose';
import { AccessLog } from '../models/AccessLog.js';
import { Report } from '../models/report.js';
import ReportedMessageBackup from "../models/reportedMessageBackup.js";


/**
 * 접속 로그 자동 정리 스케줄러
 * - 매일 새벽 3시에 실행
 * - 2년(730일) 이상 지난 로그 중 신고가 없는 것만 삭제
 * - 신고가 있는 유저의 로그는 3년 보관
 * - 법적 근거: 개인정보보호법 — 민감정보 접속기록 최소 2년 보관
 */
export const startAccessLogCleanup = () => {
    // 매일 새벽 3시에 실행 (0 3 * * *)
    cron.schedule('0 3 * * *', async () => {
        console.log('🧹 [스케줄러] 접속 로그 정리 시작...');
        
        try {
            const now = new Date();
            const twoYearsAgo = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
            const threeYearsAgo = new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000);
            
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 1단계: 신고가 있는 유저 목록 조회 (3년 이내)
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            const reportedUsers = await Report.distinct('offenderId', {
                createdAt: { $gte: threeYearsAgo }
            });
            
            const reportedInMessages = await ReportedMessageBackup.distinct('sender._id', {
                createdAt: { $gte: threeYearsAgo }
            });
            
            // 두 배열 합치기 (중복 제거)
            const allReportedUsers = [...new Set([
                ...reportedUsers.map(id => id.toString()),
                ...reportedInMessages.map(id => id.toString())
            ])].map(id => new mongoose.Types.ObjectId(id));
            
            console.log(`📊 [스케줄러] 3년 이내 신고된 유저: ${allReportedUsers.length}명`);
            
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 2단계: 2년 지난 로그 중 신고 없는 것만 삭제
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            const result = await AccessLog.deleteMany({
                createdAt: { $lt: twoYearsAgo },
                user: { $nin: allReportedUsers }
            });

            console.log(`✅ [스케줄러] 삭제된 로그 (2년 경과, 미신고): ${result.deletedCount}개`);
            
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 3단계: 신고된 유저의 로그도 3년 지났으면 삭제
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            if (allReportedUsers.length > 0) {
                const reportedResult = await AccessLog.deleteMany({
                    createdAt: { $lt: threeYearsAgo },
                    user: { $in: allReportedUsers }
                });
                console.log(`✅ [스케줄러] 삭제된 로그 (3년 경과, 신고됨): ${reportedResult.deletedCount}개`);
            }
            
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 4단계: 통계 출력
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            const remainingLogs = await AccessLog.countDocuments();
            const oldestLog = await AccessLog.findOne().sort({ createdAt: 1 });
            
            console.log(`📊 [스케줄러] 남은 로그: ${remainingLogs}개`);
            if (oldestLog) {
                const oldestDate = new Date(oldestLog.createdAt).toLocaleDateString('ko-KR');
                console.log(`📊 [스케줄러] 가장 오래된 로그: ${oldestDate}`);
            }
            
            console.log('✅ [스케줄러] 접속 로그 정리 완료\n');
            
        } catch (error) {
            console.error('❌ [스케줄러] 접속 로그 정리 실패:', error);
        }
    }, {
        timezone: "Asia/Seoul"
    });
    
    console.log('✅ [스케줄러] 접속 로그 자동 정리 스케줄러 시작됨 (매일 03:00)');
};
