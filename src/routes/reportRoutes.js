//src/routes/reportRoutes.js - 정리된 최종 버전
import { Router } from 'express';
import * as reportController from '../controllers/reportController.js';
//접근제한
import { authenticate } from '../middlewares/authMiddleware.js';
import { requireLevel } from '../middlewares/requireLevel.js';

const router = Router();

// 신고 생성 (인증 필요하지만 레벨 제한 없음)
router.post('/reports', authenticate, reportController.createReport);

//이 코드 작성된 이하의 코드들한테 적용됨
router.use(
    authenticate,       // JWT 인증 검사
    requireLevel(2)     // userLv ≥ 2 (관리자 이상)
);

// 전체 신고 목록 조회
router.get('/reports', reportController.getReports);

// 특정 신고 조회
router.get('/reports/:id', reportController.getReport);

// 신고 수정
router.put('/reports/:id', reportController.updateReport);

// 신고 삭제 (개발자만)
router.delete(
    '/reports/:id',
    requireLevel(3),
    reportController.deleteReport
);

// 신고에 대한 답변 추가 라우트
router.post('/reports/:id/reply', reportController.replyToReport);

// (관리자 전용) 신고된 채팅방 메시지 가져오기
router.get('/reports/:id/chat-log', reportController.getReportChatLog);

// ✅ (관리자 전용) 특정 채팅방의 모든 신고 메시지 평문 조회
router.get('/reports/:id/plaintext/all', reportController.getReportedMessagePlaintext);

// ✅ (관리자 전용) 단일 신고 메시지 평문 조회
router.get('/reports/message/:messageId/plaintext', reportController.getSingleReportedMessageBackup);

// ============================================================================
//   신고 관련 새로운 암호화 엔드포인트들 (레벨 2 이상)
// ============================================================================

// 신고된 메시지 맥락 조회 (복호화 포함)
router.get('/reports/:id/context', async (req, res) => {
    try {
        const AdminChatService = (await import('../services/adminChatService.js')).default;
        const Report = (await import('../models/report.js')).default;
        
        const reportId = req.params.id;
        const adminUser = req.user;
        const { messageCount, maxHours, timeOnly, maxMinutes } = req.query;
        
        // 신고 정보 조회
        const report = await Report.findById(reportId);
        if (!report || !report.targetId) {
            return res.status(404).json({ 
                success: false,
                message: '신고 내용을 찾을 수 없습니다.' 
            });
        }
        
        // 옵션 파라미터 구성
        const options = {
            messageCount: messageCount ? parseInt(messageCount) : 20,
            maxHours: maxHours ? parseInt(maxHours) : 48,
            timeOnly: timeOnly === 'true',
            maxMinutes: maxMinutes ? parseInt(maxMinutes) : 10
        };
        
        // 신고된 메시지 맥락 조회 (복호화 포함)
        const context = await AdminChatService.getChatContext(
            report.targetId, 
            adminUser,
            options
        );
        
        res.json({ 
            success: true, 
            report: {
                id: report._id,
                reason: report.reason,
                createdAt: report.createdAt,
                targetId: report.targetId
            },
            context: context.context,
            totalMessages: context.totalMessages,
            queryConfig: context.queryConfig,
            accessInfo: {
                accessedBy: adminUser.nickname,
                accessedAt: new Date(),
                userLevel: adminUser.userLv
            }
        });
        
    } catch (error) {
        console.error('신고 맥락 조회 실패:', error);
        res.status(403).json({ 
            success: false,
            message: error.message 
        });
    }
});

// 관리자 전용 메시지 복호화
router.post('/reports/:id/decrypt', async (req, res) => {
    try {
        const AdminChatService = (await import('../services/adminChatService.js')).default;
        const Report = (await import('../models/report.js')).default;
        
        const reportId = req.params.id;
        const adminUser = req.user;
        const { purpose } = req.body;
        
        // 신고 정보 조회
        const report = await Report.findById(reportId);
        if (!report || !report.targetId) {
            return res.status(404).json({
                success: false,
                message: '신고 내용을 찾을 수 없습니다.'
            });
        }
        
        // 메시지 복호화
        const result = await AdminChatService.decryptMessageForAdmin(
            report.targetId,
            adminUser,
            purpose || 'report_investigation'
        );
        
        res.json({
            success: true,
            messageId: result.messageId,
            decryptedText: result.decryptedText,
            sender: result.sender,
            timestamp: result.timestamp,
            isReported: result.isReported,
            source: result.source,
            accessInfo: {
                accessedBy: adminUser.nickname,
                accessedAt: result.accessedAt,
                userLevel: adminUser.userLv
            }
        });
        
    } catch (error) {
        console.error('신고 메시지 복호화 실패:', error);
        res.status(403).json({
            success: false,
            message: error.message
        });
    }
});

// 신고된 메시지 맥락 조회 (레벨 2 이상)
router.get('/reports/:id/context', async (req, res) => {
    try {
        const reportId = req.params.id;
        const { messageCount = 20, maxHours = 48, timeOnly = false } = req.query;
        const adminUser = req.user;
        
        // 신고 정보 조회
        const report = await reportController.getReportById(reportId);
        if (!report || !report.targetId) {
            return res.status(404).json({
                success: false,
                message: '신고 내용을 찾을 수 없습니다.'
            });
        }
        
        // AdminChatService 동적 import (없으면 스킵)
        try {
            const AdminChatService = (await import('../services/adminChatService.js')).default;
            
            const context = await AdminChatService.getChatContext(
                report.targetId,
                adminUser,
                {
                    messageCount: parseInt(messageCount),
                    maxHours: parseInt(maxHours),
                    timeOnly: timeOnly === 'true'
                }
            );
            
            res.json({
                success: true,
                message: '신고 메시지 맥락 조회 완료',
                reportId: reportId,
                targetMessageId: report.targetId,
                context: context,
                contextInfo: {
                    messageCount: context.length,
                    timeRange: `${maxHours}시간`,
                    requestedBy: adminUser.nickname,
                    requestedAt: new Date().toISOString()
                }
            });
            
        } catch (importError) {
            res.status(501).json({
                success: false,
                message: '관리자 채팅 서비스가 구현되지 않았습니다.',
                note: 'AdminChatService.js 파일이 필요합니다.'
            });
        }
        
    } catch (error) {
        console.error('신고 맥락 조회 실패:', error);
        res.status(403).json({
            success: false,
            message: error.message
        });
    }
});

export default router;
