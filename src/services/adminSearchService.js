// src/services/adminSearchService.js
import ChatEncryption from '../utils/encryption/chatEncryption.js';
import { ChatMessage } from '../models/chat.js';
import AdminChatService from './adminChatService.js';
import AdminAccessLog from '../models/adminAccessLog.js';

/**
 * 관리자 전용 검색 서비스
 * 키워드 해시 기반 검색으로 원본 텍스트 노출 없이 검색
 */
class AdminSearchService {
    
    /**
     * 관리자용 메시지 검색 (키워드 해시 기반)
     */
    static async searchMessages(searchTerm, adminUser, limit = 100) {
        try {
            // 권한 확인
            const permissions = AdminChatService.getPermissionsByLevel(adminUser.userLv);
            if (!permissions.includes('search_content')) {
                throw new Error('검색 권한이 없습니다.');
            }
            
            // 1. 키워드 해시 생성
            const hashedTerm = ChatEncryption.hashKeyword(searchTerm);
            
            // 2. 해시된 키워드로 검색
            const messages = await ChatMessage.find({
                keywords: hashedTerm
            })
            .populate('sender', 'nickname email')
            .populate('chatRoom', 'participants roomType')
            .sort({ createdAt: -1 })
            .limit(limit);
            
            // 3. 관리자에게만 복호화된 내용 제공
            const decryptedMessages = await Promise.all(
                messages.map(async (msg) => {
                    let decryptedText;
                    try {
                        decryptedText = await AdminChatService.decryptMessageForAdmin(
                            msg._id, adminUser, 'search_operation'
                        );
                    } catch (error) {
                        decryptedText = '[복호화 권한 없음]';
                    }
                    
                    return {
                        _id: msg._id,
                        chatRoom: {
                            _id: msg.chatRoom._id,
                            roomType: msg.chatRoom.roomType,
                            participantCount: msg.chatRoom.participants ? msg.chatRoom.participants.length : 0
                        },
                        sender: {
                            _id: msg.sender._id,
                            nickname: msg.sender.nickname,
                            email: msg.sender.email
                        },
                        text: decryptedText,
                        timestamp: msg.createdAt,
                        isReported: msg.isReported,
                        isEncrypted: msg.isEncrypted,
                        reportedAt: msg.reportedAt
                    };
                })
            );
            
            // 4. 검색 로그 기록
            await this.logSearchAccess(adminUser._id, searchTerm, decryptedMessages.length);
            
            return decryptedMessages;
            
        } catch (error) {
            console.error('메시지 검색 실패:', error);
            throw error;
        }
    }
    
    /**
     * 사용자별 채팅 히스토리 검색
     */
    static async getUserChatHistory(userId, adminUser, page = 1, limit = 50) {
        try {
            const permissions = AdminChatService.getPermissionsByLevel(adminUser.userLv);
            if (!permissions.includes('search_content')) {
                throw new Error('사용자 히스토리 조회 권한이 없습니다.');
            }
            
            const skip = (page - 1) * limit;
            
            // 1. 사용자의 메시지 조회
            const messages = await ChatMessage.find({
                sender: userId
            })
            .populate('chatRoom', 'roomType participants')
            .populate('sender', 'nickname email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
            
            // 2. 총 메시지 수 조회 (페이징용)
            const totalMessages = await ChatMessage.countDocuments({
                sender: userId
            });
            
            // 3. 메시지 복호화
            const decryptedMessages = await Promise.all(
                messages.map(async (msg) => {
                    let decryptedText;
                    try {
                        decryptedText = await AdminChatService.decryptMessageForAdmin(
                            msg._id, adminUser, 'user_history_review'
                        );
                    } catch (error) {
                        decryptedText = '[복호화 권한 없음]';
                    }
                    
                    return {
                        _id: msg._id,
                        chatRoom: {
                            _id: msg.chatRoom._id,
                            roomType: msg.chatRoom.roomType,
                            participantCount: msg.chatRoom.participants ? msg.chatRoom.participants.length : 0
                        },
                        text: decryptedText,
                        timestamp: msg.createdAt,
                        isReported: msg.isReported,
                        isEncrypted: msg.isEncrypted,
                        reportedAt: msg.reportedAt
                    };
                })
            );
            
            // 4. 접근 로그 기록
            await this.logUserHistoryAccess(adminUser._id, userId, messages.length);
            
            return {
                messages: decryptedMessages,
                pagination: {
                    current: page,
                    total: Math.ceil(totalMessages / limit),
                    hasNext: skip + messages.length < totalMessages,
                    hasPrev: page > 1,
                    totalMessages: totalMessages
                },
                summary: {
                    userId: userId,
                    totalMessages: totalMessages,
                    requestedBy: adminUser.nickname,
                    requestedAt: new Date().toISOString()
                }
            };
            
        } catch (error) {
            console.error('사용자 히스토리 조회 실패:', error);
            throw error;
        }
    }
    
    /**
     * 고급 검색 (복수 키워드, 기간 필터 등)
     */
    static async advancedSearch(searchOptions, adminUser) {
        try {
            const permissions = AdminChatService.getPermissionsByLevel(adminUser.userLv);
            if (!permissions.includes('search_content')) {
                throw new Error('고급 검색 권한이 없습니다.');
            }
            
            const {
                keywords = [],
                dateFrom,
                dateTo,
                roomType,
                isReported,
                limit = 100
            } = searchOptions;
            
            // 1. 기본 쿼리 구성
            let query = {};
            
            // 키워드 검색 (OR 조건)
            if (keywords.length > 0) {
                const hashedKeywords = keywords.map(k => ChatEncryption.hashKeyword(k));
                query.keywords = { $in: hashedKeywords };
            }
            
            // 날짜 범위 필터
            if (dateFrom || dateTo) {
                query.createdAt = {};
                if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
                if (dateTo) query.createdAt.$lte = new Date(dateTo);
            }
            
            // 신고 여부 필터
            if (typeof isReported === 'boolean') {
                query.isReported = isReported;
            }
            
            // 2. 채팅방 타입 필터 (populate 후 필터링)
            let messages = await ChatMessage.find(query)
                .populate('sender', 'nickname email')
                .populate('chatRoom', 'roomType participants')
                .sort({ createdAt: -1 })
                .limit(limit * 2); // 필터링 후 줄어들 것을 고려해 더 많이 조회
            
            // 룸 타입 필터링
            if (roomType) {
                messages = messages.filter(msg => 
                    msg.chatRoom && msg.chatRoom.roomType === roomType
                );
            }
            
            // 최종 limit 적용
            messages = messages.slice(0, limit);
            
            // 3. 메시지 복호화
            const decryptedMessages = await Promise.all(
                messages.map(async (msg) => {
                    let decryptedText;
                    try {
                        decryptedText = await AdminChatService.decryptMessageForAdmin(
                            msg._id, adminUser, 'advanced_search'
                        );
                    } catch (error) {
                        decryptedText = '[복호화 권한 없음]';
                    }
                    
                    return {
                        _id: msg._id,
                        chatRoom: msg.chatRoom,
                        sender: msg.sender,
                        text: decryptedText,
                        timestamp: msg.createdAt,
                        isReported: msg.isReported,
                        isEncrypted: msg.isEncrypted
                    };
                })
            );
            
            // 4. 로그 기록
            await this.logAdvancedSearchAccess(adminUser._id, searchOptions, decryptedMessages.length);
            
            return {
                results: decryptedMessages,
                searchOptions: searchOptions,
                resultCount: decryptedMessages.length,
                searchedBy: adminUser.nickname,
                searchedAt: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('고급 검색 실패:', error);
            throw error;
        }
    }
    
    /**
     * 검색 통계 조회
     */
    static async getSearchStatistics(days = 30) {
        try {
            const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
            
            const stats = await AdminAccessLog.aggregate([
                {
                    $match: {
                        action: 'search_operation',
                        timestamp: { $gte: startDate }
                    }
                },
                {
                    $group: {
                        _id: {
                            adminId: '$adminId',
                            keyword: '$metadata.searchKeyword'
                        },
                        count: { $sum: 1 },
                        lastSearch: { $max: '$timestamp' }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 50 }
            ]);
            
            return {
                period: `${days}일`,
                topSearches: stats,
                totalSearches: stats.reduce((sum, stat) => sum + stat.count, 0),
                generatedAt: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('검색 통계 조회 실패:', error);
            return null;
        }
    }
    
    /**
     * 검색 접근 로그 기록
     */
    static async logSearchAccess(adminId, searchTerm, resultCount) {
        try {
            await AdminAccessLog.logAccess({
                adminId: adminId,
                action: 'search_operation',
                targetType: 'ChatMessage',
                targetId: null,
                purpose: 'data_verification',
                metadata: {
                    searchKeyword: searchTerm,
                    resultCount: resultCount
                }
            });
        } catch (error) {
            console.warn('검색 로그 기록 실패:', error.message);
        }
    }
    
    /**
     * 사용자 히스토리 접근 로그 기록
     */
    static async logUserHistoryAccess(adminId, userId, messageCount) {
        try {
            await AdminAccessLog.logAccess({
                adminId: adminId,
                action: 'user_data_access',
                targetType: 'User',
                targetId: userId,
                purpose: 'user_support',
                metadata: {
                    messageCount: messageCount,
                    accessType: 'chat_history'
                }
            });
        } catch (error) {
            console.warn('히스토리 접근 로그 기록 실패:', error.message);
        }
    }
    
    /**
     * 고급 검색 접근 로그 기록
     */
    static async logAdvancedSearchAccess(adminId, searchOptions, resultCount) {
        try {
            await AdminAccessLog.logAccess({
                adminId: adminId,
                action: 'search_operation',
                targetType: 'ChatMessage',
                targetId: null,
                purpose: 'advanced_search',
                metadata: {
                    searchOptions: JSON.stringify(searchOptions),
                    resultCount: resultCount,
                    searchType: 'advanced'
                }
            });
        } catch (error) {
            console.warn('고급 검색 로그 기록 실패:', error.message);
        }
    }
}

export default AdminSearchService;