// src/routes/developerRoutes.js - 완전히 새로운 최종 버전
import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requireLevel } from '../middlewares/requireLevel.js';
import adminAccessLogger from '../middlewares/adminAccessLogger.js';
import { getDeveloperUsers,
    updateDeveloperUser,
    getDeveloperUserDetail,
    getCacheStatus,
    testNamePseudonymization,
    getDeveloperBlockedUsers,
    developerBlockUser,
    developerUnblockUser } from '../controllers/developerController.js';
import { testChatEncryption, createReportedMessageBackup } from '../services/chatService.js';
import ChatEncryption from '../utils/encryption/chatEncryption.js';
import ComprehensiveEncryption from '../utils/encryption/comprehensiveEncryption.js';
import { User } from '../models/UserProfile.js';

const router = express.Router();

// 권한 검증: JWT 인증 + userLv >= 3 (개발자만)
router.use(authenticate);
router.use(requireLevel(3));
router.use(adminAccessLogger);

// === 기존 개발자 도구들 ===
router.get('/users', getDeveloperUsers);
router.get('/cache-status', getCacheStatus);
router.post('/test-pseudonym', testNamePseudonymization);
router.get('/users/:userId', getDeveloperUserDetail);
router.patch('/users/:userId', updateDeveloperUser);

router.get('/users/:userId/blocked', getDeveloperBlockedUsers);
router.post('/users/:userId/block/:targetUserId/minimal', developerBlockUser);
router.delete('/users/:userId/block/:targetUserId/minimal', developerUnblockUser);

// === 개인정보 복호화 API (관리자 전용 - 온디맨드 복호화) ===
router.post('/decrypt-user-data', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, message: '사용자 ID가 필요합니다.' });
        }

        console.log(`🔐 [관리자도구] 개인정보 복호화 요청: ${userId} by admin ${req.user.id}`);

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

        console.log(`✅ [관리자도구] 개인정보 복호화 완료: ${userId} -> 실명: ${decryptedInfo.name ? decryptedInfo.name.substring(0, 2) + '***' : ''}`);

        res.json({ success: true, data: decryptedInfo });
    } catch (error) {
        console.error(`❌ [관리자도구] 개인정보 복호화 실패: ${userId}`, error.message);
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

// ✅ 신고된 메시지 목록 조회 (개발자 전용)
router.get('/chat/reported-messages', async (req, res) => {
    try {
        const { page = 1, limit = 20, hours = 48 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        console.log(`🔍 [신고된 메시지 목록] 조회: 페이지 ${page}, 제한 ${limit}개`);

        const { ChatMessage } = await import('../models/chat.js');

        // ⏰ 시간 제한 없이 모든 신고된 메시지 조회 (시간 필터 제거)
        const recentReportedMessages = await ChatMessage.find({
            isReported: true
        })
            .sort({ reportedAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('sender', 'nickname')
            .populate('chatRoom')
            .lean();

        const totalCount = await ChatMessage.countDocuments({
            isReported: true
        });

        // ⏰ 시간 제한 제거 - 모든 신고 메시지 항상 복호화 가능
        const processedMessages = recentReportedMessages.map(message => {
            // 미리보기 텍스트 생성
            let previewText = '내용 비공개';
            if (message.isEncrypted) {
                previewText = '[암호화된 내용 - 복호화 가능]';
            } else {
                previewText = message.text ? message.text.substring(0, 50) + (message.text.length > 50 ? '...' : '') : '[내용 없음]';
            }

            return {
                _id: message._id,
                preview: previewText,
                sender: {
                    _id: message.sender?._id,
                    nickname: message.sender?.nickname || '알 수 없음'
                },
                chatRoom: {
                    _id: message.chatRoom?._id,
                    roomType: message.chatRoom?.roomType
                },
                reportedAt: message.reportedAt,
                reportedBy: message.reportedBy,
                isEncrypted: message.isEncrypted,
                canDecrypt: true, // ⏰ 항상 true로 설정
                noTimeLimit: true // 시간 제한 없음 플래그
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
            filters: {
                hoursRange: parseInt(hours)
            },
            requestedBy: req.user.nickname,
            requestedAt: new Date().toISOString()
        };

        console.log(`✅ [신고된 메시지 목록] 완료: ${processedMessages.length}개 메시지 반환`);

        res.json(result);

    } catch (error) {
        console.error('❌ [신고된 메시지 목록] 실패:', error);
        res.status(500).json({
            success: false,
            message: '서버 오류가 발생했습니다.',
            error: error.message
        });
    }
});


router.get('/chat/reported-context/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { context = 30 } = req.query; // 기본값 30개 (위/아래)

        console.log(`🔍 [신고된 메시지 컨텍스트] 요청: ${messageId}, 컨텍스트: 상하 ${context}개`);

        // 1. 신고된 메시지 확인
        const { ChatMessage } = await import('../models/chat.js');
        const reportedMessage = await ChatMessage.findById(messageId).lean();

        if (!reportedMessage) {
            return res.status(404).json({
                success: false,
                message: '메시지를 찾을 수 없습니다.'
            });
        }

        if (!reportedMessage.isReported) {
            return res.status(400).json({
                success: false,
                message: '신고되지 않은 메시지입니다.'
            });
        }

        // 2. ⏰ 시간 제한 제거 - 항상 복호화 가능
        const reportedDate = new Date(reportedMessage.reportedAt || reportedMessage.createdAt);

        console.log(`🕰️ 신고일: ${reportedDate.toISOString()}`);
        console.log(`🔓 복호화 가능: true (시간 제한 없음)`);

        // 3. 주변 메시지들 조회 (전후 30개씩)
        const contextMessages = await ChatMessage.find({
            chatRoom: reportedMessage.chatRoom,
            createdAt: {
                $gte: new Date(reportedMessage.createdAt.getTime() - 24 * 60 * 60 * 1000), // 1일 전부터
                $lte: new Date(reportedMessage.createdAt.getTime() + 24 * 60 * 60 * 1000)  // 1일 후까지
            }
        })
            .sort({ createdAt: 1 })
            .populate('sender', 'nickname')
            .lean();

        // 4. 신고 메시지 위치 찾기
        const reportedIndex = contextMessages.findIndex(
            msg => msg._id.toString() === messageId
        );

        if (reportedIndex === -1) {
            return res.status(404).json({
                success: false,
                message: '컨텍스트에서 신고 메시지를 찾을 수 없습니다.'
            });
        }

        // 5. 전후 30개씩 추출
        const startIndex = Math.max(0, reportedIndex - context);
        const endIndex = Math.min(contextMessages.length, reportedIndex + context + 1);
        const selectedMessages = contextMessages.slice(startIndex, endIndex);

        console.log(`📊 전체 ${contextMessages.length}개 중 ${startIndex}-${endIndex} 범위 (${selectedMessages.length}개) 선택`);

        // 6. 메시지 복호화 및 처리
        const processedMessages = await Promise.all(
            selectedMessages.map(async (message, index) => {
                try {
                    let displayText = '';
                    let isDecrypted = false;

                    // 신고된 메시지는 항상 복호화
                    if (message.isReported || message._id.toString() === messageId) {
                        if (message.isEncrypted && message.encryptedText) {
                            try {
                                const encryptedData = {
                                    method: 'KMS',
                                    version: '2.0',
                                    data: {
                                        iv: message.iv,
                                        data: message.encryptedText,
                                        authTag: message.tag
                                    }
                                };

                                displayText = await ComprehensiveEncryption.decryptPersonalInfo(
                                    JSON.stringify(encryptedData)
                                );
                                isDecrypted = true;
                            } catch (decryptError) {
                                console.warn(`⚠️ 복호화 실패: ${message._id}`, decryptError.message);
                                displayText = message.text || '[복호화 실패]';
                            }
                        } else {
                            displayText = message.text || '[내용 없음]';
                        }
                    } else {
                        // 신고되지 않은 메시지도 2일간은 복호화
                        if (message.isEncrypted && message.encryptedText) {
                            try {
                                const encryptedData = {
                                    method: 'KMS',
                                    version: '2.0',
                                    data: {
                                        iv: message.iv,
                                        data: message.encryptedText,
                                        authTag: message.tag
                                    }
                                };

                                displayText = await ComprehensiveEncryption.decryptPersonalInfo(
                                    JSON.stringify(encryptedData)
                                );
                                isDecrypted = true;
                            } catch (decryptError) {
                                displayText = '[주변 메시지 - 내용 비공개]';
                            }
                        } else {
                            displayText = message.text || '[내용 없음]';
                        }
                    }

                    return {
                        _id: message._id,
                        text: displayText,
                        sender: {
                            _id: message.sender?._id,
                            nickname: message.sender?.nickname || '알 수 없음'
                        },
                        createdAt: message.createdAt,
                        isReported: message.isReported,
                        isEncrypted: message.isEncrypted,
                        isDecrypted: isDecrypted,
                        isTargetMessage: message._id.toString() === messageId,
                        contextIndex: startIndex + index
                    };
                } catch (error) {
                    console.error(`❌ 메시지 처리 실패: ${message._id}`, error);
                    return {
                        _id: message._id,
                        text: '[처리 오류]',
                        sender: { nickname: '알 수 없음' },
                        createdAt: message.createdAt,
                        isReported: message.isReported,
                        isError: true
                    };
                }
            })
        );

        // 7. 응답 데이터 구성 (⏰ 시간 제한 제거)
        const result = {
            success: true,
            reportedMessage: {
                _id: reportedMessage._id,
                reportedAt: reportedMessage.reportedAt || reportedMessage.createdAt,
                reportedBy: reportedMessage.reportedBy
            },
            contextMessages: processedMessages,
            metadata: {
                totalContextMessages: selectedMessages.length,
                reportedMessageIndex: reportedIndex,
                selectedRange: { start: startIndex, end: endIndex - 1 },
                canDecrypt: true, // ⏰ 항상 true
                noTimeLimit: true, // 시간 제한 없음 플래그
                requestedBy: req.user.nickname,
                requestedAt: new Date().toISOString()
            }
        };

        console.log(`✅ [신고 컨텍스트] 완료: ${processedMessages.length}개 메시지 반환 (시간 제한 없음)`);

        res.json(result);

    } catch (error) {
        console.error('❌ [신고 컨텍스트] 실패:', error);
        res.status(500).json({
            success: false,
            message: '서버 오류가 발생했습니다.',
            error: error.message
        });
    }
});
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
