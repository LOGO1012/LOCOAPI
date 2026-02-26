// src/routes/adminRoutes.js - 관리자 전용 라우트 (userLv >= 2)
// ✅ 최적화: ReportedMessageBackup에서 직접 평문 조회 (복호화 불필요)
import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requireLevel } from '../middlewares/requireLevel.js';
import ReportedMessageBackup from '../models/reportedMessageBackup.js';
import * as adminRewardController from '../controllers/adminRewardController.js';

const router = express.Router();

// 권한 검증: JWT 인증 + userLv >= 2 (관리자 이상)
router.use(authenticate);
router.use(requireLevel(2));

// ============================================================================
//   🎁 관리자 전용 - 채팅 횟수 보상 관리
// ============================================================================

/**
 * GET /api/admin/reward/users
 * 보상 지급을 위한 사용자 검색
 */
router.get('/reward/users', adminRewardController.searchUsersForReward);

/**
 * POST /api/admin/reward/give
 * 채팅 횟수 보상 지급
 */
router.post('/reward/give', adminRewardController.giveChatReward);

/**
 * GET /api/admin/reward/logs
 * 보상 지급 내역 조회
 */
router.get('/reward/logs', adminRewardController.getRewardLogs);

/**
 * GET /api/admin/reward/logs/:logId/items
 * 특정 보상의 상세 아이템 조회
 */
router.get('/reward/logs/:logId/items', adminRewardController.getRewardLogItems);

/**
 * POST /api/admin/reward/cancel
 * 보상 지급 취소
 */
router.post('/reward/cancel', adminRewardController.cancelReward);

/**
 * POST /api/admin/reward/cancel-all
 * 그룹 보상 전체 취소
 */
router.post('/reward/cancel-all', adminRewardController.cancelAllRewards);

// ============================================================================
//   🚨 관리자 전용 - 신고된 메시지 목록 조회 (최적화 버전)
// ============================================================================
/**
 * GET /api/admin/reported-messages
 * ✅ 최적화: ReportedMessageBackup에서 평문 직접 조회 (복호화 0회)
 */
router.get('/reported-messages', async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        console.log(`🔍 [관리자-신고목록] 조회: 페이지 ${page}, 제한 ${limit}개`);
        console.log(`👤 [관리자-신고목록] 요청자: ${req.user.nickname} (Lv.${req.user.userLv})`);

        // ✅ 백업에서 직접 조회 (이미 평문!)
        const backups = await ReportedMessageBackup.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate({
                path: 'originalMessageId',
                select: 'sender chatRoom createdAt',
                populate: [
                    { path: 'sender', select: 'nickname' },
                    { path: 'chatRoom', select: '_id roomType' }
                ]
            })
            .populate('reportedBy', 'nickname')
            .lean();

        const totalCount = await ReportedMessageBackup.countDocuments();

        // ✅ 백업에서 평문 사용 (복호화 불필요!)
        const processedMessages = backups
            .filter(backup => backup.originalMessageId) // null 체크
            .map((backup) => {
                return {
                    _id: backup.originalMessageId._id,
                    text: backup.plaintextContent,  // ✅ 이미 평문!
                    sender: {
                        _id: backup.originalMessageId.sender?._id,
                        nickname: backup.originalMessageId.sender?.nickname || '알 수 없음'
                    },
                    chatRoom: {
                        _id: backup.originalMessageId.chatRoom?._id,
                        roomType: backup.originalMessageId.chatRoom?.roomType
                    },
                    reportedAt: backup.createdAt,
                    reportedBy: backup.reportedBy?.map(user => ({
                        _id: user._id,
                        nickname: user.nickname
                    })) || [],
                    reportReason: backup.reportReason,
                    createdAt: backup.originalMessageId.createdAt,
                    backupId: backup._id
                };
            });

        const result = {
            success: true,
            messages: processedMessages,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount,
                totalPages: Math.ceil(totalCount / parseInt(limit))
            },
            role: '관리자',
            optimization: {
                method: 'backup_direct_query',
                decryptionCount: 0,
                description: '백업에서 평문 직접 조회 (복호화 불필요)'
            },
            requestedBy: req.user.nickname,
            requestedAt: new Date().toISOString()
        };

        console.log(`✅ [관리자-신고목록] 완료: ${processedMessages.length}개 메시지 반환 (복호화 0회)`);

        res.json(result);

    } catch (error) {
        console.error('❌ [관리자-신고목록] 실패:', error);
        res.status(500).json({
            success: false,
            message: '서버 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// ============================================================================
//   🚨 관리자 전용 - 신고된 단일 메시지 상세 조회 (최적화 버전)
// ============================================================================
/**
 * GET /api/admin/reported-messages/:messageId
 * ✅ 최적화: ReportedMessageBackup에서 평문 직접 조회
 */
router.get('/reported-messages/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;

        console.log(`🔍 [관리자-신고상세] 요청: ${messageId}`);
        console.log(`👤 [관리자-신고상세] 요청자: ${req.user.nickname} (Lv.${req.user.userLv})`);

        // ✅ 백업에서 직접 조회
        const backup = await ReportedMessageBackup.findOne({
            originalMessageId: messageId
        })
            .populate({
                path: 'originalMessageId',
                select: 'sender chatRoom createdAt',
                populate: [
                    { path: 'sender', select: 'nickname _id' },
                    { path: 'chatRoom', select: '_id roomType' }
                ]
            })
            .populate('reportedBy', 'nickname _id')
            .lean();

        if (!backup) {
            return res.status(404).json({
                success: false,
                message: '신고된 메시지 백업을 찾을 수 없습니다.'
            });
        }

        if (!backup.originalMessageId) {
            return res.status(404).json({
                success: false,
                message: '원본 메시지가 삭제되었습니다.'
            });
        }

        // ✅ 접근 로그 기록
        backup.accessLog = backup.accessLog || [];
        backup.accessLog.push({
            accessedBy: req.user._id,
            accessTime: new Date(),
            purpose: 'admin_review',
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent') || 'unknown'
        });

        // 접근 로그 저장 (lean()으로 조회했으므로 다시 저장)
        await ReportedMessageBackup.findByIdAndUpdate(
            backup._id,
            { $push: { accessLog: backup.accessLog[backup.accessLog.length - 1] } }
        );

        const result = {
            success: true,
            message: {
                _id: backup.originalMessageId._id,
                text: backup.plaintextContent,  // ✅ 이미 평문!
                sender: {
                    _id: backup.originalMessageId.sender?._id,
                    nickname: backup.originalMessageId.sender?.nickname || '알 수 없음'
                },
                chatRoom: {
                    _id: backup.originalMessageId.chatRoom?._id,
                    roomType: backup.originalMessageId.chatRoom?.roomType
                },
                reportedAt: backup.createdAt,
                reportedBy: backup.reportedBy?.map(user => ({
                    _id: user._id,
                    nickname: user.nickname
                })) || [],
                reportReason: backup.reportReason,
                createdAt: backup.originalMessageId.createdAt,
                retentionUntil: backup.retentionUntil
            },
            accessLog: {
                totalAccess: backup.accessLog.length,
                recentAccess: backup.accessLog.slice(-5) // 최근 5개
            },
            role: '관리자',
            optimization: {
                method: 'backup_direct_query',
                decryptionCount: 0,
                description: '백업에서 평문 직접 조회 (복호화 불필요)'
            },
            note: '관리자는 신고된 메시지만 조회할 수 있습니다.',
            requestedBy: req.user.nickname,
            requestedAt: new Date().toISOString()
        };

        console.log(`✅ [관리자-신고상세] 완료: ${messageId} (복호화 0회, 접근 로그 기록)`);

        res.json(result);

    } catch (error) {
        console.error('❌ [관리자-신고상세] 실패:', error);
        res.status(500).json({
            success: false,
            message: '서버 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// ============================================================================
//   📊 관리자 전용 - 신고 통계 조회
// ============================================================================
/**
 * GET /api/admin/reported-statistics
 * 신고 메시지 통계 정보 조회
 */
router.get('/reported-statistics', async (req, res) => {
    try {
        console.log(`📊 [관리자-통계] 요청자: ${req.user.nickname} (Lv.${req.user.userLv})`);

        // 전체 신고 건수
        const totalReports = await ReportedMessageBackup.countDocuments();

        // 오늘 신고 건수
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayReports = await ReportedMessageBackup.countDocuments({
            createdAt: { $gte: today }
        });

        // 이번 주 신고 건수
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekReports = await ReportedMessageBackup.countDocuments({
            createdAt: { $gte: weekAgo }
        });

        // 신고 사유별 통계
        const reasonStats = await ReportedMessageBackup.aggregate([
            {
                $group: {
                    _id: '$reportReason',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        res.json({
            success: true,
            statistics: {
                total: totalReports,
                today: todayReports,
                thisWeek: weekReports,
                byReason: reasonStats
            },
            requestedBy: req.user.nickname,
            requestedAt: new Date().toISOString()
        });

        console.log(`✅ [관리자-통계] 완료: 총 ${totalReports}건`);

    } catch (error) {
        console.error('❌ [관리자-통계] 실패:', error);
        res.status(500).json({
            success: false,
            message: '서버 오류가 발생했습니다.',
            error: error.message
        });
    }
});

export default router;
