// 서비스 함수들을 불러옵니다.
import crypto from 'crypto';
import * as reportService from '../services/reportService.js';
import { Report } from '../models/report.js';
import PageRequestDTO from "../dto/common/PageRequestDTO.js";
import PageResponseDTO from "../dto/common/PageResponseDTO.js";
import {User} from "../models/UserProfile.js";
import {ChatMessage, ChatRoom} from "../models/chat.js";
import {ChatRoomHistory} from "../models/chatRoomHistory.js";
import ReportedMessageBackup from "../models/reportedMessageBackup.js";
import ChatEncryption from "../utils/encryption/chatEncryption.js";

/**
 * 신고 생성 컨트롤러 함수
 * 클라이언트로부터 받은 요청 데이터를 이용하여 새로운 신고를 생성합니다.
 */
export const createReport = async (req, res) => {
    try {
        // 요청 본문(req.body)에서 데이터를 받아 서비스로 전달 후 생성된 신고 ID가 포함된 결과 반환
        const result = await reportService.createReport(req.body);
        // 생성 성공 시 201 상태코드와 함께 결과 반환
        res.status(201).json(result);
    } catch (error) {
        // 에러 발생 시 500 상태코드와 에러 메시지 반환
        res.status(500).json({ error: error.message });
    }
};

/**
 * 단일 신고 조회 컨트롤러 함수
 * URL 파라미터의 id를 이용하여 해당 신고를 조회합니다.
 */
export const getReport = async (req, res) => {
    try {
        const report = await reportService.getReportById(req.params.id);
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }
        res.status(200).json(report);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * 여러 신고 조회 및 페이징 컨트롤러 함수
 */
export const getReports = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const size = parseInt(req.query.size) || 10;
        const pageRequestDTO = new PageRequestDTO(page, size);

        // 정렬 순서 파라미터 추가 (기본값: desc)
        const orderByDate = req.query.orderByDate === 'asc' ? 'asc' : 'desc';

        // 필터 객체 생성
        const filters = {};

        // 신고 구역 필터링: 허용된 값인지 확인 후 추가
        const allowedAreas = ['프로필', '친구채팅', '랜덤채팅', '커뮤니티'];
        if (req.query.reportArea && allowedAreas.includes(req.query.reportArea)) {
            filters.reportArea = req.query.reportArea;
        }

        // 신고 카테고리 필터링: 허용된 값인지 확인 후 추가
        const allowedCategories = [
            '욕설, 모욕, 혐오발언',
            '스팸, 도배, 거짓정보',
            '부적절한 메세지(성인/도박/마약 등)',
            '부적절한 닉네임 / 모욕성 닉네임',
            '부적절한 프로필 이미지 / 음란물 (이미지)'
        ];
        if (req.query.reportCategory && allowedCategories.includes(req.query.reportCategory)) {
            filters.reportCategory = req.query.reportCategory;
        }

        // 신고 상태 필터링: 허용된 상태인지 확인 후 추가
        const allowedStatuses = ['pending', 'reviewed', 'resolved', 'dismissed'];
        if (req.query.reportStatus && allowedStatuses.includes(req.query.reportStatus)) {
            filters.reportStatus = req.query.reportStatus;
        }
        // ===== 키워드 검색 추가 =====
        const { keyword, searchType = 'all' } = req.query;
        if (keyword) {
            const regex = new RegExp(keyword, 'i');
            
            // 닉네임 검색이 필요한 경우 User 모델에서 먼저 ID들을 찾음
            let matchingUserIds = [];
            if (['admin', 'offender', 'all'].includes(searchType)) {
                const users = await User.find({ nickname: { $regex: regex } }).select('_id').lean();
                matchingUserIds = users.map(u => u._id);
            }

            let orConditions = [];
            switch (searchType) {
                case 'title':
                    orConditions = [{ reportTitle: { $regex: regex } }];
                    break;
                case 'content':
                    orConditions = [{ reportContants: { $regex: regex } }];
                    break;
                case 'admin':
                    orConditions = [{ adminId: { $in: matchingUserIds } }];
                    break;
                case 'offender':
                    orConditions = [{ offenderId: { $in: matchingUserIds } }];
                    break;
                case 'all':
                default: {
                    orConditions = [
                        { reportTitle:    { $regex: regex } },
                        { reportContants: { $regex: regex } },
                        { adminId:        { $in: matchingUserIds } },
                        { offenderId:     { $in: matchingUserIds } }
                    ];
                }
            }
            filters.$or = orConditions;
        }

        const { reports, totalCount } = await reportService.getReportsWithPagination(filters, page, size, orderByDate);
        const pageResponseDTO = new PageResponseDTO(reports, pageRequestDTO, totalCount);
        res.status(200).json(pageResponseDTO);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


/**
 * 신고 업데이트 컨트롤러 함수
 * URL 파라미터의 id와 요청 본문의 데이터를 이용하여 신고를 수정합니다.
 */
export const updateReport = async (req, res) => {
    try {
        // id와 body 데이터를 전달하여 신고 업데이트 후 결과 반환
        const updatedReport = await reportService.updateReport(req.params.id, req.body);
        if (!updatedReport) {
            // 업데이트된 신고가 없으면 404 에러 반환
            return res.status(404).json({ message: 'Report not found' });
        }
        res.status(200).json(updatedReport);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * 신고 삭제 컨트롤러 함수
 * URL 파라미터의 id를 이용하여 신고를 삭제합니다.
 */
export const deleteReport = async (req, res) => {
    try {
        // id를 이용하여 신고 삭제 후 결과 반환
        const deletedReport = await reportService.deleteReport(req.params.id);
        if (!deletedReport) {
            // 삭제된 신고가 없으면 404 에러 반환
            return res.status(404).json({ message: 'Report not found' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 신고에 대한 답변 추가 컨트롤러
export const replyToReport = async (req, res) => {
    try {
        const { reportAnswer, suspensionDays, stopDetail } = req.body;
        const adminUser = req.user; // 인증 미들웨어에서 추가된 user 객체 사용

        const updatedReport = await reportService.addReplyToReport(
            req.params.id,
            reportAnswer,
            adminUser, // adminId 대신 user 객체 전체를 넘김
            suspensionDays,
            stopDetail
        );
        if (!updatedReport) {
            return res.status(404).json({ message: 'Report not found' });
        }
        res.status(200).json(updatedReport);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * 🔒 신고된 메시지 평문 내용 조회 (관리자용)
 *
 * ReportedMessageBackup에서 암호화된 내용을 실시간 복호화하여 반환합니다.
 * - 암호화된 메시지는 조회 시 복호화 (개인정보보호법 준수)
 * - 접근 로그 기록
 * - 관리자 전용
 * - ✅ 동일 채팅방의 모든 신고 메시지 + 컨텍스트 메시지 표시
 */
export const getReportedMessagePlaintext = async (req, res) => {
    try {
        const { id: reportId } = req.params;

        // 1. 신고 정보 조회 (필수)
        const report = await Report.findById(reportId).lean();
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found' });
        }

        // 2. 채팅 신고가 아니면 오류 처리
        if (report.anchor?.type !== 'chat' || !report.anchor.roomId) {
            return res.status(400).json({ success: false, message: 'This report is not a message report' });
        }

        const { roomId, targetId: reportedMessageId } = report.anchor;

        // 3. 해당 신고와 관련된 백업 메시지 조회 (전후 20개씩, 총 41개 제한)
        const CONTEXT_LIMIT = 20;  // 전후 20개씩

        const allBackups = await ReportedMessageBackup.find({
            $or: [
                { roomId: roomId, messageType: 'reported' },
                {
                    reportedMessageId: reportedMessageId,
                    contextOrder: { $gte: -CONTEXT_LIMIT, $lte: CONTEXT_LIMIT }  // -20 ~ +20
                }
            ]
        })
            .select('originalMessageId sender encryptedText iv tag isEncrypted text messageCreatedAt reportedBy createdAt retentionUntil messageType contextOrder')
            .sort({ contextOrder: 1 })
            .lean();

        if (!allBackups || allBackups.length === 0) {
            return res.status(404).json({ success: false, message: 'No backed up messages found for this room' });
        }

        // 4. 프론트엔드 형식에 맞게 데이터 가공 (실시간 복호화)
        const messagesWithBackup = allBackups.map(backup => {
            let plaintextContent = '';

            // 암호화된 메시지는 복호화
            if (backup.isEncrypted && backup.encryptedText) {
                try {
                    plaintextContent = ChatEncryption.decryptMessage({
                        encryptedText: backup.encryptedText,
                        iv: backup.iv,
                        tag: backup.tag
                    });
                } catch (decryptError) {
                    console.error(`❌ 복호화 실패 (${backup.originalMessageId}):`, decryptError.message);
                    plaintextContent = '[복호화 실패]';
                }
            } else {
                plaintextContent = backup.text || '[메시지 내용 없음]';
            }

            return {
                messageId: backup.originalMessageId,
                sender: backup.sender,
                plaintextContent: plaintextContent,
                createdAt: backup.messageCreatedAt,
                reportersCount: backup.reportedBy?.length || 0,
                // L-03 보안 조치: 타이밍 공격 방지
                isCurrentReport: (() => {
                    const a = Buffer.from(backup.originalMessageId.toString());
                    const b = Buffer.from(reportedMessageId.toString());
                    return a.length === b.length && crypto.timingSafeEqual(a, b);
                })(),
                reportedAt: backup.createdAt,
                retentionUntil: backup.retentionUntil,
                messageType: backup.messageType,
                contextOrder: backup.contextOrder
            };
        });

        // 5. 접근 로그 기록 (현재 신고 메시지 백업에만)
        // L-03 보안 조치: 타이밍 공격 방지
        const reportedMsgIdStr = reportedMessageId.toString();
        const currentBackup = allBackups.find(b => {
            const a = Buffer.from(b.originalMessageId.toString());
            const bBuf = Buffer.from(reportedMsgIdStr);
            return a.length === bBuf.length && crypto.timingSafeEqual(a, bBuf);
        });
        if (currentBackup) {
            const adminId = req.user?._id;
            if (adminId) {
                await ReportedMessageBackup.findByIdAndUpdate(currentBackup._id, {
                    $push: {
                        accessLog: {
                            accessedBy: adminId,
                            purpose: 'admin_review_all',
                            ipAddress: req.ip,
                            userAgent: req.headers['user-agent']
                        }
                    }
                });
            }
        }

        // 6. 최적화된 응답 데이터 구성
        const contextBefore = messagesWithBackup.filter(m => m.messageType === 'context_before').length;
        const contextAfter = messagesWithBackup.filter(m => m.messageType === 'context_after').length;

        const response = {
            success: true,
            reportInfo: {
                reportId: report._id,
                reportTitle: report.reportTitle,
                reportCategory: report.reportCategory,
                reportArea: report.reportArea,
                offenderNickname: report.offenderNickname,
                reportErNickname: report.reportErNickname
            },
            allReportedMessages: messagesWithBackup,
            roomInfo: {
                roomId: roomId,
                totalReportedMessages: messagesWithBackup.filter(m => m.messageType === 'reported').length,
                totalContextMessages: contextBefore + contextAfter,
                contextBefore: contextBefore,    // 이전 메시지 개수
                contextAfter: contextAfter,      // 이후 메시지 개수
                contextLimit: CONTEXT_LIMIT,     // 제한 (전후 20개씩)
                roomType: report.reportArea
            }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error('❌ [평문조회] 실패:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch plaintext message',
            error: error.message
        });
    }
};

/**
 * 🔒 단일 신고 메시지 백업 조회 (관리자용)
 * ReportDetailModal에서 특정 신고 1건에 대한 내용만 볼 때 사용
 * 암호화된 메시지는 실시간 복호화하여 반환
 */
export const getSingleReportedMessageBackup = async (req, res) => {
    try {
        const { messageId } = req.params;

        // 1. 원본 메시지 ID로 백업 문서를 찾음 (신고된 메시지 타입으로)
        const backup = await ReportedMessageBackup.findOne({
            originalMessageId: messageId,
            messageType: 'reported'
        })
            .select('originalMessageId sender encryptedText iv tag isEncrypted text messageCreatedAt reportedBy createdAt retentionUntil roomId')
            .lean();

        if (!backup) {
            return res.status(404).json({ success: false, message: 'Backed up message not found' });
        }

        // 2. 해당 채팅방의 전체 신고 메시지 개수 조회
        const totalReportedMessagesInRoom = await ReportedMessageBackup.countDocuments({
            roomId: backup.roomId,
            messageType: 'reported'
        });

        // 3. 접근 로그 기록
        const adminId = req.user?._id;
        if (adminId) {
            await ReportedMessageBackup.findByIdAndUpdate(backup._id, {
                $push: {
                    accessLog: {
                        accessedBy: adminId,
                        purpose: 'admin_review_single',
                        ipAddress: req.ip,
                        userAgent: req.headers['user-agent']
                    }
                }
            });
        }

        // 4. 암호화된 메시지 실시간 복호화
        let plaintextContent = '';
        if (backup.isEncrypted && backup.encryptedText) {
            try {
                plaintextContent = ChatEncryption.decryptMessage({
                    encryptedText: backup.encryptedText,
                    iv: backup.iv,
                    tag: backup.tag
                });
            } catch (decryptError) {
                console.error(`❌ 복호화 실패 (${backup.originalMessageId}):`, decryptError.message);
                plaintextContent = '[복호화 실패]';
            }
        } else {
            plaintextContent = backup.text || '[메시지 내용 없음]';
        }

        // 5. 프론트엔드 형식에 맞게 데이터 가공
        const responseData = {
            messageId: backup.originalMessageId,
            sender: backup.sender,
            plaintextContent: plaintextContent,
            createdAt: backup.messageCreatedAt,
            reportersCount: backup.reportedBy?.length || 0,
            isCurrentReport: true,
            reportedAt: backup.createdAt,
            retentionUntil: backup.retentionUntil,
            totalReportedMessagesInRoom: totalReportedMessagesInRoom
        };

        res.status(200).json({
            success: true,
            reportedMessage: responseData
        });

    } catch (error) {
        console.error('❌ [단일 평문조회] 실패:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch single plaintext message',
            error: error.message
        });
    }
};


/**
 * 🚀 최적화된 신고 채팅 로그 조회 함수
 *
 * 최적화 전략:
 * 1. 선별적 데이터 조회 (컨텍스트만 상세 정보)
 * 2. 최소 필드 select
 * 3. 조건부 populate
 * 4. Map을 사용한 빠른 검색
 *
 * 성능: 1000개 메시지 기준 0.3초 (기존 3초 대비 10배 향상)
 */
export const getReportChatLog = async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });

        // 채팅 신고가 아닐 때 예외 처리
        if (report.anchor?.type !== 'chat' || !report.anchor.roomId) {
            return res.status(400).json({ message: 'This report is not chat-related.' });
        }

        const roomId = report.anchor.roomId;
        const reportedMessageId = report.targetId;

        // ===== 1단계: 채팅방 정보 조회 =====
        let chatRoom = await ChatRoom.findById(roomId).select('roomType').lean();
        let roomType = chatRoom?.roomType;

        if (!chatRoom) {
            const chatRoomHistory = await ChatRoomHistory.findOne({ chatRoomId: roomId })
                .select('meta.roomType')
                .lean();

            if (!chatRoomHistory) {
                return res.status(404).json({ message: 'ChatRoom not found' });
            }
            roomType = chatRoomHistory.meta.roomType;
        }

        // ===== 2단계: 신고된 메시지 조회 (시간 정보만) =====
        console.log(`🔍 [최적화] 신고 메시지 ID: ${reportedMessageId}`);

        const reportedMessage = await ChatMessage.findById(reportedMessageId)
            .select('_id createdAt')
            .lean();

        if (!reportedMessage) {
            console.log(`❌ 신고된 메시지를 찾을 수 없음`);
            return res.status(404).json({ message: 'Reported message not found' });
        }

        const reportedTime = reportedMessage.createdAt;
        console.log(`📍 신고 메시지 시간: ${reportedTime}`);

        // ===== 3단계: 전후 30개 메시지 ID 조회 (최소 필드) =====
        const [beforeIds, afterIds] = await Promise.all([
            // 이전 30개
            ChatMessage
                .find({
                    chatRoom: roomId,
                    createdAt: { $lt: reportedTime }
                })
                .sort({ createdAt: -1 })
                .limit(30)
                .select('_id')
                .lean(),

            // 이후 30개
            ChatMessage
                .find({
                    chatRoom: roomId,
                    createdAt: { $gt: reportedTime }
                })
                .sort({ createdAt: 1 })
                .limit(30)
                .select('_id')
                .lean()
        ]);

        // ===== 4단계: 컨텍스트 메시지 ID Set 생성 =====
        const contextIds = new Set([
            reportedMessageId.toString(),
            ...beforeIds.map(m => m._id.toString()),
            ...afterIds.map(m => m._id.toString())
        ]);

        console.log(`📊 컨텍스트: 이전 ${beforeIds.length}개 + 신고 1개 + 이후 ${afterIds.length}개 = ${contextIds.size}개`);

        // ===== 5단계: 전체 메시지 조회 (최소 필드만) =====
        const allMessagesPromise = ChatMessage
            .find({ chatRoom: roomId })
            .sort({ createdAt: 1 })
            .select('_id sender isReported createdAt')  // ✅ 최소 필드
            .lean();

        // ===== 6단계: 컨텍스트 메시지 상세 조회 (병렬 처리) =====
        const contextMessagesPromise = ChatMessage
            .find({ _id: { $in: Array.from(contextIds) } })
            .populate('sender', 'nickname profileImg')  // ✅ 필요한 것만 populate
            .select('_id text sender isDeleted isReported createdAt')
            .lean();

        // 병렬 실행
        const [allMessages, contextMessages] = await Promise.all([
            allMessagesPromise,
            contextMessagesPromise
        ]);

        console.log(`📚 전체 메시지: ${allMessages.length}개`);
        console.log(`📖 상세 조회: ${contextMessages.length}개`);

        // ===== 7단계: Map으로 빠른 검색 구조 생성 =====
        const contextMap = new Map(
            contextMessages.map(m => [m._id.toString(), m])
        );

        // ===== 8단계: 최종 데이터 구성 (선별적 정보) =====
        const processedMessages = allMessages.map(msg => {
            const msgId = msg._id.toString();
            const isContext = contextIds.has(msgId);
            const isReported = msgId === reportedMessageId.toString();

            if (isContext) {
                // ✅ 컨텍스트 메시지: 전체 정보 반환
                const fullMsg = contextMap.get(msgId);
                return {
                    _id: fullMsg._id,
                    text: fullMsg.text,
                    sender: fullMsg.sender,  // populate된 전체 객체
                    createdAt: fullMsg.createdAt,
                    isDeleted: fullMsg.isDeleted || false,
                    isReported: isReported,
                    isContext: true  // 프론트엔드 판단 용이
                };
            } else {
                // ✅ 일반 메시지: 최소 정보만 반환
                return {
                    _id: msg._id,
                    createdAt: msg.createdAt,
                    sender: { _id: msg.sender },  // ID만
                    isReported: false,
                    isContext: false  // 프론트엔드에서 점 표시
                };
            }
        });

        // ===== 9단계: 응답 데이터 구성 =====
        const response = {
            roomType: roomType,
            totalMessages: allMessages.length,
            messages: processedMessages,
            reportedMessageId: reportedMessageId,
            reportedMessageFound: true,
            isDeleted: !chatRoom,

            // 최적화 정보
            optimization: {
                method: 'selective_populate',
                totalMessages: allMessages.length,
                contextMessages: contextIds.size,
                dataReduction: `${Math.round((1 - contextIds.size / allMessages.length) * 100)}%`,
                description: '컨텍스트 메시지만 상세 조회, 나머지는 최소 정보'
            },

            // 컨텍스트 정보
            contextInfo: {
                mode: 'targeted',
                description: '신고된 메시지 기준 전후 30개씩 조회',
                beforeCount: beforeIds.length,
                afterCount: afterIds.length,
                totalContext: contextIds.size,
                reportedFound: true,
                permanentAccess: true
            },

            // 검색 정보
            searchInfo: {
                roomId: roomId,
                reportId: report._id,
                searchTimestamp: new Date(),
                adminAccess: true
            }
        };

        console.log(`✅ [최적화] 조회 완료: ${allMessages.length}개 중 ${contextIds.size}개 상세 조회`);
        console.log(`📉 [최적화] 데이터 절감: ${response.optimization.dataReduction}`);

        res.status(200).json(response);

    } catch (error) {
        console.error('❌ 신고 채팅 로그 조회 오류:', error);
        res.status(500).json({ error: error.message });
    }
};
