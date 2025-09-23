// src/services/adminChatService.js
import ChatEncryption from '../utils/encryption/chatEncryption.js';
import { ChatMessage } from '../models/chat.js';
import ReportedMessageBackup from '../models/reportedMessageBackup.js';
import AdminAccessLog from '../models/adminAccessLog.js';

/**
 * 관리자 전용 채팅 서비스
 * 기존 userLv 권한 시스템 활용 (1: 일반, 2: 관리자, 3: 개발자)
 */
class AdminChatService {
    
    /**
     * 레벨별 권한 정의 (기존 userLv 활용)
     */
    static getPermissionsByLevel(userLv) {
        const permissions = {
            1: [], // 일반 사용자: 권한 없음
            2: ['view_reports', 'decrypt_reported_messages'], // 관리자: 신고된 메시지만
            3: ['view_reports', 'decrypt_messages', 'search_content', 'full_admin_access'] // 개발자: 모든 권한
        };
        
        return permissions[userLv] || [];
    }
    
    /**
     * 관리자 권한으로 메시지 복호화
     */
    static async decryptMessageForAdmin(messageId, adminUser, purpose) {
        try {
            // 1. 권한 확인
            const permissions = this.getPermissionsByLevel(adminUser.userLv);
            if (!permissions.includes('decrypt_messages') && !permissions.includes('decrypt_reported_messages')) {
                throw new Error('메시지 복호화 권한이 없습니다.');
            }
            
            const message = await ChatMessage.findById(messageId);
            if (!message) {
                throw new Error('메시지를 찾을 수 없습니다.');
            }
            
            let decryptedText;
            
            // 2. 신고된 메시지는 백업에서 조회 (더 빠름)
            if (message.isReported && permissions.includes('decrypt_reported_messages')) {
                decryptedText = await this.getReportedMessageFromBackup(messageId, adminUser);
            }
            
            // 3. 일반 메시지 복호화 (개발자만)
            if (!decryptedText && permissions.includes('decrypt_messages')) {
                if (message.isEncrypted && message.encryptedText) {
                    decryptedText = ChatEncryption.decryptMessage({
                        encryptedText: message.encryptedText,
                        iv: message.iv,
                        tag: message.tag
                    });
                } else {
                    decryptedText = message.text; // 기존 평문 메시지
                }
            }
            
            if (!decryptedText) {
                throw new Error('복호화 권한이 없거나 복호화에 실패했습니다.');
            }
            
            // 4. 접근 로그 기록
            await this.logDecryptionAccess(messageId, adminUser._id, purpose);
            
            return decryptedText;
            
        } catch (error) {
            console.error('관리자 메시지 복호화 실패:', error);
            throw error;
        }
    }
    
    /**
     * 신고된 메시지 백업에서 조회
     */
    static async getReportedMessageFromBackup(messageId, adminUser) {
        try {
            const backup = await ReportedMessageBackup.findOne({
                originalMessageId: messageId
            });
            
            if (backup) {
                // 접근 로그 추가
                backup.accessLog.push({
                    accessedBy: adminUser._id,
                    accessTime: new Date(),
                    purpose: 'report_investigation',
                    ipAddress: adminUser.lastLoginIP || 'unknown'
                });
                await backup.save();
                
                return backup.plaintextContent;
            }
            
            return null;
        } catch (error) {
            console.error('백업에서 조회 실패:', error);
            return null;
        }
    }
    
    /**
     * 신고된 채팅 맥락 조회 (하이브리드 모델)
     */
    static async getChatContext(reportedMessageId, adminUser, options = {}) {
        try {
            const {
                messageCount = 20,    // 전후 20개씩
                maxHours = 48,        // 최대 48시간 
                timeOnly = false      // true면 시간 방식만 사용
            } = options;
            
            const reportedMessage = await ChatMessage.findById(reportedMessageId);
            if (!reportedMessage) {
                throw new Error('신고된 메시지를 찾을 수 없습니다.');
            }
            
            const chatRoomId = reportedMessage.chatRoom;
            let query = { chatRoom: chatRoomId };
            
            if (timeOnly) {
                // 기존 시간 기반 방식
                const timeRange = maxHours * 60 * 60 * 1000; // 밀리초로 변환
                query.createdAt = {
                    $gte: new Date(reportedMessage.createdAt.getTime() - timeRange),
                    $lte: new Date(reportedMessage.createdAt.getTime() + timeRange)
                };
            } else {
                // 하이브리드 방식: 메시지 개수 + 시간 제한
                const timeLimit = new Date(Date.now() - (maxHours * 60 * 60 * 1000));
                query.createdAt = { $gte: timeLimit };
            }
            
            let contextMessages = await ChatMessage.find(query)
                .sort({ createdAt: 1 })
                .populate('sender', 'nickname');
            
            if (!timeOnly) {
                // 신고 메시지를 중심으로 전후 messageCount개씩 선택
                const reportedIndex = contextMessages.findIndex(msg => 
                    msg._id.equals(reportedMessageId)
                );
                
                if (reportedIndex !== -1) {
                    const start = Math.max(0, reportedIndex - messageCount);
                    const end = Math.min(contextMessages.length, reportedIndex + messageCount + 1);
                    contextMessages = contextMessages.slice(start, end);
                }
            }
            
            // 모든 메시지 복호화 (관리자 권한)
            const decryptedContext = await Promise.all(
                contextMessages.map(async (msg) => {
                    let text;
                    try {
                        text = await this.decryptMessageForAdmin(
                            msg._id, 
                            adminUser, 
                            'context_investigation'
                        );
                    } catch (error) {
                        text = '[복호화 권한 없음]';
                    }
                    
                    return {
                        _id: msg._id,
                        sender: msg.sender,
                        text: text,
                        timestamp: msg.createdAt,
                        isReported: msg._id.equals(reportedMessageId),
                        isEncrypted: msg.isEncrypted
                    };
                })
            );
            
            return decryptedContext;
            
        } catch (error) {
            console.error('채팅 맥락 조회 실패:', error);
            throw error;
        }
    }
    
    /**
     * 복호화 접근 로그 기록
     */
    static async logDecryptionAccess(messageId, adminId, purpose) {
        try {
            // AdminAccessLog가 있는 경우에만 기록
            try {
                await AdminAccessLog.logAccess({
                    adminId: adminId,
                    action: 'message_decryption',
                    targetType: 'ChatMessage',
                    targetId: messageId,
                    purpose: purpose,
                    timestamp: new Date()
                });
            } catch (logError) {
                // 로그 기록 실패해도 복호화는 계속 진행
                console.warn('접근 로그 기록 실패:', logError.message);
            }
        } catch (error) {
            console.error('복호화 접근 로그 기록 실패:', error);
        }
    }
    
    /**
     * 관리자별 최근 접근 이력 조회
     */
    static async getAdminAccessHistory(adminId, days = 30) {
        try {
            const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
            
            return await AdminAccessLog.find({
                adminId: adminId,
                timestamp: { $gte: startDate }
            })
            .sort({ timestamp: -1 })
            .limit(100)
            .lean();
        } catch (error) {
            console.error('관리자 접근 이력 조회 실패:', error);
            return [];
        }
    }
    
    /**
     * 시스템 접근 통계 조회
     */
    static async getAccessStatistics(days = 7) {
        try {
            const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
            
            const stats = await AdminAccessLog.aggregate([
                { $match: { timestamp: { $gte: startDate } } },
                {
                    $group: {
                        _id: {
                            action: '$action',
                            adminLevel: '$adminLevel'
                        },
                        count: { $sum: 1 },
                        lastAccess: { $max: '$timestamp' }
                    }
                },
                { $sort: { count: -1 } }
            ]);
            
            return {
                period: `${days}일`,
                totalAccess: stats.reduce((sum, stat) => sum + stat.count, 0),
                byAction: stats,
                generatedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('접근 통계 조회 실패:', error);
            return null;
        }
    }
}

export default AdminChatService;