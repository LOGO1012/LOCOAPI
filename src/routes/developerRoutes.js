// src/routes/developerRoutes.js - 완전히 새로운 최종 버전
import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requireLevel } from '../middlewares/requireLevel.js';
import { getDeveloperUsers, updateDeveloperUser, getDeveloperUserDetail, getCacheStatus, testNamePseudonymization } from '../controllers/developerController.js';
import { testChatEncryption, createReportedMessageBackup } from '../services/chatService.js';
import ChatEncryption from '../utils/encryption/chatEncryption.js';
import ComprehensiveEncryption from '../utils/encryption/comprehensiveEncryption.js';
import { User } from '../models/UserProfile.js';

const router = express.Router();

// 권한 검증: JWT 인증 + userLv >= 3 (개발자만)
router.use(authenticate);
router.use(requireLevel(3));

// === 기존 개발자 도구들 ===
router.get('/users', getDeveloperUsers);
router.get('/cache-status', getCacheStatus);
router.post('/test-pseudonym', testNamePseudonymization);
router.get('/users/:userId', getDeveloperUserDetail);
router.patch('/users/:userId', updateDeveloperUser);

// === 개인정보 복호화 API (개발자 페이지용) ===
router.post('/decrypt-user-data', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, message: '사용자 ID가 필요합니다.' });
        }
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }
        
        // 개인정보 복호화
        const decryptedInfo = {
            _id: user._id,
            nickname: user.nickname,
            name: user.name ? await ComprehensiveEncryption.decryptPersonalInfo(user.name) : '',
            phone: user.phone ? await ComprehensiveEncryption.decryptPersonalInfo(user.phone) : '',
            birthdate: user.birthdate ? await ComprehensiveEncryption.decryptPersonalInfo(user.birthdate) : '',
            gender: user.gender,
            calculatedAge: user.calculatedAge,
            ageGroup: user.ageGroup,
            isMinor: user.isMinor,
            email: user.email,
            userLv: user.userLv,
            star: user.star,
            createdAt: user.createdAt,
            social: {
                kakao: user.social?.kakao ? {
                    name: user.social.kakao.name ? await ComprehensiveEncryption.decryptPersonalInfo(user.social.kakao.name) : '',
                    phoneNumber: user.social.kakao.phoneNumber ? await ComprehensiveEncryption.decryptPersonalInfo(user.social.kakao.phoneNumber) : '',
                    birthday: user.social.kakao.birthday ? await ComprehensiveEncryption.decryptPersonalInfo(user.social.kakao.birthday) : '',
                    birthyear: user.social.kakao.birthyear ? await ComprehensiveEncryption.decryptPersonalInfo(user.social.kakao.birthyear) : '',
                    gender: user.social.kakao.gender
                } : null,
                naver: user.social?.naver ? {
                    name: user.social.naver.name ? await ComprehensiveEncryption.decryptPersonalInfo(user.social.naver.name) : '',
                    phoneNumber: user.social.naver.phoneNumber ? await ComprehensiveEncryption.decryptPersonalInfo(user.social.naver.phoneNumber) : '',
                    birthday: user.social.naver.birthday ? await ComprehensiveEncryption.decryptPersonalInfo(user.social.naver.birthday) : '',
                    birthyear: user.social.naver.birthyear ? await ComprehensiveEncryption.decryptPersonalInfo(user.social.naver.birthyear) : '',
                    gender: user.social.naver.gender
                } : null
            }
        };
        
        res.json({ success: true, data: decryptedInfo });
    } catch (error) {
        console.error('개인정보 복호화 실패:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// === 새로 추가된 관리자 도구들 ===

// 채팅 메시지 검색 (개발자 전용)
router.get('/chat/search', async (req, res) => {
    try {
        const { keyword, limit = 50 } = req.query;
        const adminUser = req.user;
        
        if (!keyword) {
            return res.status(400).json({ message: '검색어를 입력해주세요.' });
        }
        
        const { default: AdminChatService } = await import('../services/adminChatService.js');
        const results = await AdminChatService.searchMessages(keyword, adminUser, parseInt(limit));
        
        res.json({ success: true, results, keyword, count: results.length });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 사용자별 채팅 히스토리 (개발자 전용)
router.get('/users/:userId/chat-history', async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const adminUser = req.user;
        
        const { default: AdminChatService } = await import('../services/adminChatService.js');
        const history = await AdminChatService.getUserChatHistory(
            userId, 
            adminUser, 
            parseInt(page), 
            parseInt(limit)
        );
        
        res.json({ success: true, history });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 나이 계산 테스트 (개발자 전용)
router.get('/test-age/:birthdate', async (req, res) => {
    try {
        const { birthdate } = req.params;
        
        const result = {
            input: birthdate,
            calculatedAge: ComprehensiveEncryption.calculateAge(birthdate),
            isMinor: ComprehensiveEncryption.isMinor(birthdate),
            ageGroup: ComprehensiveEncryption.getAgeGroup(birthdate),
            testedAt: new Date().toISOString(),
            testedBy: req.user.nickname
        };
        
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 채팅 암호화 시스템 테스트
router.get('/test-chat-encryption', async (req, res) => {
    try {
        const { message = '테스트 메시지입니다! Hello 123' } = req.query;
        
        const performanceTest = ChatEncryption.performanceTest(message);
        const systemTest = await testChatEncryption();
        
        res.json({ 
            success: true, 
            performanceTest,
            systemTest,
            testedAt: new Date().toISOString(),
            testedBy: req.user.nickname
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 신고 메시지 백업 테스트
router.post('/test/create-message-backup', async (req, res) => {
    try {
        const { messageId, reportData } = req.body;
        
        if (!messageId) {
            return res.status(400).json({
                success: false,
                message: 'messageId가 필요합니다.'
            });
        }
        
        const defaultReportData = {
            reportedBy: req.user._id,
            reason: reportData?.reason || 'test_report',
            reportId: 'test_' + Date.now(),
            ...reportData
        };
        
        const result = await createReportedMessageBackup(messageId, defaultReportData);
        
        res.json({
            success: true,
            result: result,
            testedBy: req.user.nickname,
            testedAt: new Date()
        });
        
    } catch (error) {
        console.error('메시지 백업 테스트 실패:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 나이 계산 테스트 (개발자 전용)
router.get('/test-age/:birthdate', async (req, res) => {
    try {
        const { birthdate } = req.params;
        
        if (!birthdate || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) {
            return res.status(400).json({
                success: false,
                message: 'YYYY-MM-DD 형식의 생년월일이 필요합니다.'
            });
        }
        
        const result = {
            input: birthdate,
            age: ComprehensiveEncryption.calculateAge(birthdate),
            ageGroup: ComprehensiveEncryption.getAgeGroup(birthdate),
            isMinor: ComprehensiveEncryption.isMinor(birthdate),
            testedAt: new Date().toISOString(),
            testedBy: req.user.nickname
        };
        
        res.json({
            success: true,
            message: '나이 계산 테스트 완료',
            result: result
        });
        
    } catch (error) {
        console.error('나이 계산 테스트 실패:', error);
        res.status(500).json({
            success: false,
            message: '나이 계산 테스트 실패: ' + error.message
        });
    }
});

// 채팅 시스템 상태 확인
router.get('/chat/status', async (req, res) => {
    try {
        const status = {
            encryptionEnabled: process.env.CHAT_ENCRYPTION_ENABLED === 'true',
            chatSalt: process.env.CHAT_SALT ? '설정됨' : '없음',
            searchSalt: process.env.SEARCH_SALT ? '설정됨' : '없음',
            retentionDays: process.env.REPORTED_MESSAGE_RETENTION_DAYS || '기본값',
            timestamp: new Date().toISOString()
        };
        
        res.json({
            success: true,
            message: '채팅 시스템 상태 확인',
            data: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '상태 확인 실패',
            error: error.message
        });
    }
});

// === 관리자 도구 API (개발자 전용) ===

// 메시지 검색 (레벨 3만)
router.get('/chat/search', async (req, res) => {
    try {
        const { keyword, limit = 50 } = req.query;
        
        if (!keyword) {
            return res.status(400).json({
                success: false,
                message: '검색어를 입력해주세요.'
            });
        }
        
        // AdminSearchService 동적 import (없으면 스킵)
        try {
            const AdminSearchService = (await import('../services/adminSearchService.js')).default;
            const results = await AdminSearchService.searchMessages(keyword, req.user, parseInt(limit));
            
            res.json({
                success: true,
                message: `"${keyword}" 검색 완료`,
                results: results,
                resultCount: results.length,
                searchedBy: req.user.nickname,
                searchedAt: new Date().toISOString()
            });
        } catch (importError) {
            res.status(501).json({
                success: false,
                message: '관리자 검색 서비스가 구현되지 않았습니다.',
                note: 'AdminSearchService.js 파일이 필요합니다.'
            });
        }
        
    } catch (error) {
        console.error('메시지 검색 실패:', error);
        res.status(500).json({
            success: false,
            message: '메시지 검색 실패: ' + error.message
        });
    }
});

// 사용자별 채팅 히스토리 (레벨 3만)
router.get('/users/:userId/chat-history', async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        
        // AdminSearchService 동적 import (없으면 스킵)
        try {
            const AdminSearchService = (await import('../services/adminSearchService.js')).default;
            const history = await AdminSearchService.getUserChatHistory(
                userId,
                req.user,
                parseInt(page),
                parseInt(limit)
            );
            
            res.json({
                success: true,
                message: '사용자 채팅 히스토리 조회 완료',
                history: history,
                requestedBy: req.user.nickname,
                requestedAt: new Date().toISOString()
            });
        } catch (importError) {
            res.status(501).json({
                success: false,
                message: '관리자 검색 서비스가 구현되지 않았습니다.',
                note: 'AdminSearchService.js 파일이 필요합니다.'
            });
        }
        
    } catch (error) {
        console.error('채팅 히스토리 조회 실패:', error);
        res.status(500).json({
            success: false,
            message: '채팅 히스토리 조회 실패: ' + error.message
        });
    }
});

export default router;
