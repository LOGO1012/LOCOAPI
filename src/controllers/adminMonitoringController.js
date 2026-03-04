import IntelligentCache from '../utils/cache/intelligentCache.js';
import ChatEncryption from '../utils/encryption/chatEncryption.js';
import ComprehensiveEncryption from '../utils/encryption/comprehensiveEncryption.js';
import ReportedMessageBackup from '../models/reportedMessageBackup.js';
import { Report } from '../models/report.js';
import { User } from '../models/UserProfile.js';
import mongoose from 'mongoose';

/**
 * 유저 통계 정보 조회 (모니터링용)
 */
export const getUserStatistics = async (req, res) => {
    try {
        console.log(`👤 [유저-모니터링] 조회 요청자: ${req.user.nickname}`);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
            totalUsers,
            newUsersToday,
            levelStatsRaw,
            statusStatsRaw,
            genderStatsRaw,
            recentUsers
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ createdAt: { $gte: today } }),
            User.aggregate([{ $group: { _id: '$userLv', count: { $sum: 1 } } }]),
            User.aggregate([{ $group: { _id: '$reportStatus', count: { $sum: 1 } } }]),
            User.aggregate([{ $group: { _id: '$gender', count: { $sum: 1 } } }]),
            User.find({}, 'nickname profilePhoto userLv createdAt')
                .sort({ createdAt: -1 })
                .limit(10)
        ]);

        // 데이터 정제: 성별 (male/M -> 남성, female/F -> 여성)
        const genderStats = [
            { _id: '남성', count: 0 },
            { _id: '여성', count: 0 },
            { _id: '기타', count: 0 }
        ];

        genderStatsRaw.forEach(stat => {
            if (['male', 'M'].includes(stat._id)) genderStats[0].count += stat.count;
            else if (['female', 'F'].includes(stat._id)) genderStats[1].count += stat.count;
            else genderStats[2].count += stat.count;
        });

        res.json({
            success: true,
            summary: {
                total: totalUsers,
                newToday: newUsersToday,
            },
            distribution: {
                levels: levelStatsRaw,
                status: statusStatsRaw,
                gender: genderStats
            },
            recentSignups: recentUsers
        });
    } catch (error) {
        console.error('❌ [유저-모니터링] 실패:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 시스템 전체 모니터링 상태 조회 (캐시, 보안, DB 등)
 */
export const getSystemStatus = async (req, res) => {
    try {
        console.log(`📊 [시스템-모니터링] 조회 요청자: ${req.user.nickname} (Lv.${req.user.userLv})`);

        // 1. 캐시 상태 정보 수집
        const cacheStats = await IntelligentCache.getCacheStats();
        const memoryStats = IntelligentCache.getMemoryCacheStats();
        const onlineCount = await IntelligentCache.getOnlineUserCount();
        
        // 2. 보안 및 암호화 상태 정보 수집
        const encryptionTest = ChatEncryption.performanceTest();
        const kmsEnabled = process.env.ENABLE_KMS === 'true';
        
        // 3. DB 및 리소스 상태 (신고 통계 포함)
        const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
        
        // 상세 신고 건수 조회
        const [
            totalChatBackups,
            profileReports,
            communityReports,
            chatReports,
            pendingReports
        ] = await Promise.all([
            ReportedMessageBackup.countDocuments(),
            Report.countDocuments({ reportArea: '프로필' }),
            Report.countDocuments({ reportArea: '커뮤니티' }),
            Report.countDocuments({ reportArea: { $in: ['친구채팅', '랜덤채팅'] } }),
            Report.countDocuments({ reportStatus: 'pending' })
        ]);
        
        // 4. 환경 변수 상태 (민감 정보 제외)
        const envStatus = {
            NODE_ENV: process.env.NODE_ENV,
            ENABLE_KMS: kmsEnabled,
            ENABLE_CACHE: process.env.ENABLE_CACHE === 'true',
            AWS_REGION: process.env.AWS_REGION || 'not_set'
        };

        const result = {
            success: true,
            timestamp: new Date().toISOString(),
            cache: {
                ...cacheStats,
                memoryDetail: memoryStats,
                onlineUsers: onlineCount,
                isRedis: cacheStats.type === 'Redis'
            },
            security: {
                kmsEnabled,
                encryptionMethod: kmsEnabled ? 'AWS KMS + AES' : 'Local AES-256-GCM',
                performance: encryptionTest,
                chatKeyInitialized: !!ChatEncryption.deriveChatKey // 간접 확인
            },
            database: {
                status: dbStatus,
                reportCount: totalChatBackups, // 기존 호환성 유지
                reports: {
                    total: profileReports + communityReports + chatReports,
                    profile: profileReports,
                    community: communityReports,
                    chat: chatReports,
                    chatBackups: totalChatBackups,
                    pending: pendingReports
                },
                dbName: mongoose.connection.name
            },
            environment: envStatus,
            requestedBy: req.user.nickname
        };

        res.json(result);
    } catch (error) {
        console.error('❌ [시스템-모니터링] 조회 실패:', error);
        res.status(500).json({
            success: true, // 에러 시에도 기본 구조는 맞춰서 응답
            error: error.message,
            cache: { type: 'Error', isRedis: false },
            security: { kmsEnabled: false }
        });
    }
};

/**
 * 캐시 강제 정리 (Flush)
 */
export const flushCache = async (req, res) => {
    try {
        const { pattern = '*' } = req.body;
        console.log(`🗑️ [시스템-캐시정리] 요청: 패턴 "${pattern}" by ${req.user.nickname}`);
        
        let deletedCount = 0;
        if (pattern === '*') {
            // 전체 삭제 로직은 신중해야 하므로 IntelligentCache에 구현된 deleteCacheByPattern 활용
            deletedCount = await IntelligentCache.deleteCacheByPattern('*');
        } else {
            deletedCount = await IntelligentCache.deleteCacheByPattern(pattern);
        }

        res.json({
            success: true,
            message: `${deletedCount}개의 캐시 항목이 성공적으로 삭제되었습니다.`,
            deletedCount
        });
    } catch (error) {
        console.error('❌ [시스템-캐시정리] 실패:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Redis 강제 재연결 시도
 */
export const reconnectRedis = async (req, res) => {
    try {
        console.log(`🔄 [시스템-Redis재연결] 요청 by ${req.user.nickname}`);
        const result = await IntelligentCache.forceRedisConnection();
        
        res.json({
            success: true,
            currentMode: result,
            message: result === 'Redis' ? 'Redis에 성공적으로 연결되었습니다.' : 'Redis 연결에 실패하여 메모리 모드로 유지됩니다.'
        });
    } catch (error) {
        console.error('❌ [시스템-Redis재연결] 실패:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
