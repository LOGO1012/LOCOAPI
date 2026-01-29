import * as chatService from '../services/chatService.js';
import {leaveChatRoomService} from "../services/chatService.js";
import {ChatRoomExit, ChatMessage} from "../models/chat.js";
import { createReport } from '../services/reportService.js';
import ChatRoomResponseDTO from '../dto/common/ChatRoomResponseDTO.js';
import mongoose from 'mongoose';
import ChatEncryption from '../utils/encryption/chatEncryption.js';
import { io } from '../socket/socketIO.js';


/**
 * 채팅방 생성 컨트롤러
 */
export const createRoom = async (req, res) => {
    try {
        const { roomType, capacity, matchedGender, ageGroup } = req.body;

        // 🔄 ageGroup 값 변환 (다양한 형태 지원)
        let normalizedAgeGroup = ageGroup;
        if (ageGroup) {
            // 연령대 문자열을 adult/minor로 변환
            if (ageGroup.includes('성인') || ageGroup.includes('20') || ageGroup.includes('30') || ageGroup.includes('40') || ageGroup.includes('50') || ageGroup === 'adult') {
                normalizedAgeGroup = 'adult';
            } else if (ageGroup.includes('미성년') || ageGroup.includes('10') || ageGroup.includes('청소년') || ageGroup === 'minor') {
                normalizedAgeGroup = 'minor';
            } else {
                // 기본값: 성인으로 처리
                normalizedAgeGroup = 'adult';
            }
            console.log(`🔄 [ageGroup 변환] "${ageGroup}" → "${normalizedAgeGroup}"`);
        }

        const room = await chatService.createChatRoom(roomType, capacity, matchedGender, normalizedAgeGroup);
        res.status(201).json({ _id: room._id });  // ✅ _id만 반환
    } catch (error) {
        console.error('[chatController.createRoom] error:', error);
        res.status(500).json({ error: error.message });
    }
};

//친구와 채팅방 생성
export const createFriendRoom = async (req, res) => {
    try {
        const { roomType, capacity } = req.body;

        // ✅ 입력 검증
        if (!roomType || !capacity) {
            return res.status(400).json({
                error: '채팅방 타입과 인원수가 필요합니다.',
                errorCode: 'MISSING_PARAMS'
            });
        }

        if (roomType !== 'friend' || capacity !== 2) {
            return res.status(400).json({
                error: '친구 채팅방은 2명만 가능합니다.',
                errorCode: 'INVALID_PARAMS'
            });
        }

        const room = await chatService.createFriendRoom(roomType, capacity);
        res.status(201).json({ _id: room._id });
    } catch (error) {
        console.error('[createFriendRoom] 오류:', error);

        // ✅ 에러 타입별 응답
        if (error.code === 11000) {
            return res.status(409).json({
                error: '이미 존재하는 채팅방입니다.',
                errorCode: 'DUPLICATE_ROOM'
            });
        }

        res.status(500).json({
            error: error.message || '채팅방 생성에 실패했습니다.',
            errorCode: 'INTERNAL_ERROR'
        });
    }

}

/**
 * 특정 채팅방 조회 컨트롤러
 */
// controllers/chatController.js
export const getRoomById = async (req, res) => {
    try {
        const room = await chatService.getChatRoomById(req.params.roomId);
        if (!room)
            return res.status(404).json({ message: '채팅방을 찾을 수 없습니다.' });

        // 1) 퇴장 목록 조회
        const exited = await ChatRoomExit.distinct('user', { chatRoom: room._id });

        // 2) 현재 남아 있는 유저만 필터링
        const activeUsers = room.chatUsers.filter(u =>
            !exited.some(id => id.toString() === u._id.toString())
        );

        const responseDTO = ChatRoomResponseDTO.from(room, activeUsers);



        return res.status(200).json(responseDTO);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};


/**
 * 모든 채팅방 조회 컨트롤러 (필터링 및 페이징 지원)
 */
export const getAllRooms = async (req, res) => {
    try {
        // req.query를 그대로 전달하여 서버측 필터링 및 페이징을 적용
        const rooms = await chatService.getAllChatRooms(req.query);

        // ✅ 중복 없이 그대로 반환
        res.status(200).json(rooms);
    } catch (error) {
        console.error('[getAllRooms] 에러:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * 채팅방에 사용자 추가
 */
export const addUserToRoom = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { userId, selectedGender } = req.body;  // 🔧 selectedGender 추가

        const room = await chatService.addUserToRoom(roomId, userId, selectedGender);   // 🔧 selectedGender 전달
        return res.status(200).json(room);
    } catch (error) {

        // 서비스가 status 필드를 제공하면 그대로 사용
        const status = error.status || 500;
        return res.status(status).json({ error: error.message });
    }
};



/**
 * 메시지 저장 컨트롤러
 */
export const sendMessage = async (req, res) => {
    try {
        const { chatRoom, sender, text } = req.body;
        const message = await chatService.saveMessage(chatRoom, sender, text);

        if (io) {
            io.to(chatRoom).emit('new_message', message);
            console.log(`📡 [Socket] 메시지 실시간 전송: ${text}`);
        }

        res.status(201).json(message);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * 특정 채팅방의 메시지 가져오기 (사용자용 - 자동 복호화)
 */
export const getMessages = async (req, res) => {
    try {
        // 쿼리 파라미터 includeDeleted=true 면 히스토리 방 메시지도 모두 조회
        const includeDeleted = req.query.includeDeleted === 'true';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        // 요청한 사용자 ID (인증 미들웨어에서 설정되거나 쿼리에서 전달)
        const requestUserId = req.user?.id || req.query.userId;

        const result = await chatService.getMessagesByRoom(
            req.params.roomId,
            includeDeleted,
            page,
            limit,
            requestUserId  // 사용자 ID 전달
        );

        res.status(200).json(result);
    } catch (error) {
        console.error('메시지 조회 실패:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * 채팅 메시지 삭제
 */
export const deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        await chatService.softDeleteMessage(messageId);

        res.status(204).send();  // 응답 본문 없음
    } catch (error) {
        console.error('메시지 삭제 실패:', error);

        // 에러 타입에 따른 상세 응답
        const status = error.status || 500;
        const message = error.message || '메시지 삭제에 실패했습니다.';

        res.status(status).json({
            success: false,
            message: message,
            code: error.code || 'DELETE_MESSAGE_FAILED'
        });
    }
};

/**
 * 채팅방에서 사용자 제거
 */
export const leaveChatRoom = async (req, res) => {
    try {
        const { roomId, userId } = req.params;  // userId는 URL 파라미터에서 받기

        if (!userId) {
            return res.status(400).json({ success: false });
        }

        await leaveChatRoomService(roomId, userId);
        res.status(200).json({ success: true });  // ✅ success만 반환
    } catch (error) {
        console.error("채팅방 나가기 실패:", error);

        // ✅ 에러 타입별로 HTTP 상태 코드와 에러 코드 구분

        // 1. 채팅방을 찾을 수 없음
        if (error.message?.includes('찾을 수 없습니다')) {
            return res.status(404).json({
                success: false,
                errorCode: 'ROOM_NOT_FOUND',
                message: '채팅방을 찾을 수 없습니다.'
            });
        }

        // 2. 잘못된 ObjectId
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                errorCode: 'INVALID_ID',
                message: '잘못된 요청입니다.'
            });
        }

        // 3. 이미 퇴장한 방
        if (error.message?.includes('이미 퇴장')) {
            return res.status(409).json({
                success: false,
                errorCode: 'ALREADY_LEFT',
                message: '이미 퇴장한 채팅방입니다.'
            });
        }

        // 4. 권한 없음
        if (error.message?.includes('권한')) {
            return res.status(403).json({
                success: false,
                errorCode: 'PERMISSION_DENIED',
                message: '권한이 없습니다.'
            });
        }

        // 5. 기타 서버 오류 (실제 500 에러)
        res.status(500).json({
            success: false,
            errorCode: 'INTERNAL_ERROR',
            message: '서버 오류가 발생했습니다.'
        });
    }
};

// /**
//  * 사용자 종료한 채팅방 ID 목록 조회 컨트롤러
//  */
// export const getLeftRooms = async (req, res) => {
//     try {
//         const { userId } = req.params;
//         const leftRooms = await chatService.getUserLeftRooms(userId);
//         res.status(200).json({ leftRooms });
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// };

export const updateRoomActive = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { active } = req.body;            // Boolean

        // ✅ 1. 입력 검증
        if (!roomId) {
            return res.status(400).json({
                success: false,
                error: 'roomId가 필요합니다.',
                errorCode: 'MISSING_ROOM_ID'
            });
        }

        if (typeof active !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'active는 boolean 타입이어야 합니다.',
                errorCode: 'INVALID_ACTIVE_TYPE'
            });
        }

        const room = await chatService.setRoomActive(roomId, active);

        // ✅ 3. 성공 응답
        res.status(200).json({
            success: true,
            isActive: room.isActive
        });

    } catch (error) {
        // ✅ 4. 에러 타입별 처리
        const status = error.status || 500;
        const errorCode = error.code || 'INTERNAL_ERROR';

        res.status(status).json({
            success: false,
            error: error.message,
            errorCode: errorCode
        });

        // ✅ 5. 서버 에러 로깅
        if (status === 500) {
            console.error('[updateRoomActive] 서버 오류:', error);
        }
    }

};


/**
 * GET /api/search/chat-room-history
 */
export const getChatRoomHistory = async (req, res) => {
    try {
        const dtoList = await chatService.getChatRoomHistory(req.query);
        return res.status(200).json({ dtoList });
    } catch (error) {
        console.error('히스토리 조회 실패:', error);
        return res.status(500).json({ error: error.message });
    }
};

/**
 * 메시지 읽음 처리 컨트롤러
 */
export const markMessagesAsRead = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { userId } = req.body;

        await chatService.markMessagesAsRead(roomId, userId);

        // ✅ 단순화: success만 반환
        res.status(200).json({ success: true });
        // const result = await chatService.markMessagesAsRead(roomId, userId);
        // res.status(200).json({
        //     success: true,
        //     modifiedCount: result.modifiedCount
        // });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


/**
 * 안읽은 메시지 개수 조회
 */
export const getUnreadCount = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { userId } = req.query;

        const count = await chatService.getUnreadMessageCount(roomId, userId);
        res.status(200).json({ unreadCount: count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * 여러 채팅방의 안읽은 메시지 개수 일괄 조회
 * POST /api/chat/rooms/unread-batch
 */
export const getUnreadCountsBatch = async (req, res) => {
    try {
        const { roomIds, userId } = req.body;

        // 입력 검증
        if (!Array.isArray(roomIds) || roomIds.length === 0) {
            return res.status(400).json({
                error: 'roomIds는 배열이어야 하며 비어있을 수 없습니다.'
            });
        }

        if (!userId) {
            return res.status(400).json({
                error: 'userId가 필요합니다.'
            });
        }

        if (roomIds.length > 100) {
            return res.status(400).json({
                error: '한 번에 최대 100개 채팅방까지 조회 가능합니다.'
            });
        }

        // 서비스 호출
        const counts = await chatService.getUnreadCountsBatch(roomIds, userId);

        res.status(200).json({
            counts: counts  // { roomId: unreadCount }
        });

    } catch (error) {
        console.error('❌ [배치조회] 컨트롤러 오류:', error);
        res.status(500).json({
            error: '안읽은 개수 배치 조회 실패',
            details: error.message
        });
    }
};

/**
 * 채팅방 입장 시간 기록 컨트롤러
 */
export const recordRoomEntry = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: '사용자 ID가 필요합니다.'
            });
        }

        // ✅ entryTime은 서비스에서 자동 생성 (파라미터 2개만 전달)
        await chatService.recordRoomEntry(roomId, userId);

        // ✅ HTTP 204 No Content (Response Body 없음)
        res.status(204).send();
    } catch (error) {
        console.error('채팅방 입장 시간 기록 실패:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// ============================================================================
//   🚨 메시지 신고 시스템
// ============================================================================

/**
 * 개별 메시지 신고 컨트롤러
 * POST /api/chat/messages/:messageId/report
 */
export const reportMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const {
            reportErId,           // 신고자 ID
            reportTitle,          // 신고 제목
            reportCategory,       // 신고 사유
            reportContants,       // 신고 상세 내용
            roomType = 'random'   // 채팅방 타입 (기본값: random)
        } = req.body;

        console.log(`🚨 [메시지신고] 신고 접수:`, {
            messageId,
            reportErId,
            reportCategory,
            roomType,
            bodyKeys: Object.keys(req.body)
        });

        // ⭐ 카테고리 매핑: 프론트엔드 값 → 백엔드 enum 값
        const categoryMapping = {
            // 기존 프론트엔드 값들
            '욕설, 모욕, 명예훼손': '욕설, 모욕, 혐오발언',
            '성적인 발언': '부적절한 메세지(성인/도박/마약 등)',
            '마약관련': '부적절한 메세지(성인/도박/마약 등)',
            '스팸': '스팸, 도배, 거짓정보',

            // 정확한 백엔드 enum 값들 (그대로 통과)
            '욕설, 모욕, 혐오발언': '욕설, 모욕, 혐오발언',
            '스팸, 도배, 거짓정보': '스팸, 도배, 거짓정보',
            '부적절한 메세지(성인/도박/마약 등)': '부적절한 메세지(성인/도박/마약 등)',
            '규칙에 위반되는 프로필/모욕성 닉네임': '규칙에 위반되는 프로필/모욕성 닉네임',
            '음란물 배포(이미지)': '음란물 배포(이미지)'
        };

        // 매핑된 카테고리 사용
        const mappedCategory = categoryMapping[reportCategory] || reportCategory;

        console.log(`🔄 [카테고리 매핑] "${reportCategory}" → "${mappedCategory}"`);

        // 1. 신고할 메시지 존재 확인
        const message = await ChatMessage.findById(messageId)
            .populate('sender', 'nickname _id')
            .populate('chatRoom', '_id roomType');

        if (!message) {
            console.log(`❌ [메시지신고] 메시지 없음: ${messageId}`);
            return res.status(404).json({
                success: false,
                message: '신고할 메시지를 찾을 수 없습니다.'
            });
        }

        // 2. 자기 자신의 메시지는 신고 불가
        if (message.sender._id.toString() === reportErId) {
            return res.status(400).json({
                success: false,
                message: '자신의 메시지는 신고할 수 없습니다.'
            });
        }

        // 3. 이미 신고한 메시지인지 확인
        if (message.reportedBy && message.reportedBy.includes(reportErId)) {
            return res.status(400).json({
                success: false,
                message: '이미 신고한 메시지입니다.'
            });
        }

        // 4. ChatMessage 신고 상태 업데이트
        await ChatMessage.findByIdAndUpdate(messageId, {
            $set: {
                isReported: true,
                reportedAt: new Date()
            },
            $addToSet: {
                reportedBy: reportErId
            }
        });

        // 5. Report 컬렉션에 신고 데이터 생성
        const reportArea = message.chatRoom.roomType === 'friend' ? '친구채팅' : '랜덤채팅';

        const reportData = {
            reportTitle: reportTitle || `메시지 신고: ${mappedCategory}`,
            reportArea: reportArea,
            reportCategory: mappedCategory,  // ⭐ 매핑된 카테고리 사용
            reportContants: reportContants,
            reportErId: reportErId,
            offenderId: message.sender._id,
            targetType: 'message',                    // 신고 타겟 타입
            targetId: messageId,                      // 신고된 메시지 ID
            anchor: {
                type: 'chat',
                roomId: message.chatRoom._id,
                parentId: message.chatRoom._id,
                targetId: messageId
            }
        };

        const createdReport = await createReport(reportData);

        // 6. 신고된 메시지 백업 생성 (법적 대응용)
        try {
            console.log(`📋 [백업] 시작 - messageId: ${messageId}`);
            
            // ✅ reason enum 값으로 매핑
            const reasonMapping = {
                '욕설, 모욕, 혐오발언': 'harassment',
                '스팸, 도배, 거짓정보': 'spam',
                '부적절한 메세지(성인/도박/마약 등)': 'inappropriate',
                '규칙에 위반되는 프로필/모욕성 닉네임': 'inappropriate',
                '음란물 배포(이미지)': 'inappropriate'
            };
            
            const mappedReason = reasonMapping[mappedCategory] || 'other';
            console.log(`📋 [백업] 카테고리 매핑: "${mappedCategory}" → "${mappedReason}"`);
            
            const backupResult = await chatService.createReportedMessageBackup(messageId, {
                reportedBy: reportErId,
                reason: mappedReason,  // ✅ enum 값으로 전달
                reportId: createdReport._id
            });

            console.log(`📋 [백업] 결과:`, backupResult);
            
            if (!backupResult.success) {
                console.error(`❌ [백업] 실패:`, backupResult.error);
            }
        } catch (backupError) {
            console.error(`⚠️ [백업] 예외 발생:`, backupError);
            console.error(`⚠️ [백업] 스택:`, backupError.stack);
        }

        console.log(`✅ [메시지신고] 신고 완료: ${messageId}`);

        res.status(201).json({
            success: true,
            message: '메시지 신고가 접수되었습니다.',
            reportId: createdReport._id,
            messageId: messageId
        });

    } catch (error) {
        console.error('❌ [메시지신고] 처리 실패:', error);
        res.status(500).json({
            success: false,
            message: '신고 처리 중 오류가 발생했습니다.',
            error: error.message
        });
    }
};

/**
 * 채팅방의 신고된 메시지 목록 조회 (개발자 페이지용)
 * GET /api/chat/rooms/:roomId/reported-messages
 *
 * 🎯 기능:
 * - 채팅방의 모든 isReported=true 메시지 조회
 * - 각 신고 메시지 기준 전후 20개씩 포함 (총 41개씩)
 */
export const getReportedMessages = async (req, res) => {
    try {
        const { roomId } = req.params;
        const CONTEXT_COUNT = 20;  // 전후 20개씩 (총 41개)

        console.log(`🔍 [신고메시지조회] 채팅방 ${roomId}의 신고된 메시지 조회 시작`);

        // 1. 채팅방의 모든 신고된 메시지 조회
        const reportedMessages = await ChatMessage.find({
            chatRoom: roomId,
            isReported: true
        })
        .sort({ createdAt: 1 })
        .populate('sender', 'nickname profileImg')
        .populate('reportedBy', 'nickname');

        if (!reportedMessages || reportedMessages.length === 0) {
            console.log(`ℹ️ [신고메시지조회] 신고된 메시지 없음`);
            return res.status(200).json({
                success: true,
                reportedMessages: [],
                contextMessageIds: [],
                totalReported: 0,
                message: '신고된 메시지가 없습니다.'
            });
        }

        console.log(`📊 [신고메시지조회] 신고된 메시지 ${reportedMessages.length}개 발견`);

        // 2. 각 신고 메시지의 전후 20개씩 조회 (총 41개)
        const contextMessagesSet = new Set(); // 중복 제거용

        for (const reportedMsg of reportedMessages) {
            // 신고된 메시지 자체 포함
            contextMessagesSet.add(reportedMsg._id.toString());

            // 이전 20개 메시지
            const beforeMessages = await ChatMessage.find({
                chatRoom: roomId,
                createdAt: { $lt: reportedMsg.createdAt }
            })
            .sort({ createdAt: -1 })
            .limit(CONTEXT_COUNT)
            .populate('sender', 'nickname profileImg');

            beforeMessages.forEach(msg => {
                contextMessagesSet.add(msg._id.toString());
            });

            // 이후 20개 메시지
            const afterMessages = await ChatMessage.find({
                chatRoom: roomId,
                createdAt: { $gt: reportedMsg.createdAt }
            })
            .sort({ createdAt: 1 })
            .limit(CONTEXT_COUNT)
            .populate('sender', 'nickname profileImg');

            afterMessages.forEach(msg => {
                contextMessagesSet.add(msg._id.toString());
            });
        }
        
        console.log(`📋 [신고메시지조회] 컨텍스트 메시지 ${contextMessagesSet.size}개 수집`);
        
        // 3. 응답 데이터 구성
        res.status(200).json({
            success: true,
            reportedMessages: reportedMessages.map(msg => ({
                _id: msg._id,
                text: msg.text,
                sender: msg.sender,
                createdAt: msg.createdAt,
                reportedAt: msg.reportedAt,
                reportedBy: msg.reportedBy,
                isReported: true
            })),
            contextMessageIds: Array.from(contextMessagesSet),
            totalReported: reportedMessages.length,
            totalContext: contextMessagesSet.size,
            message: `신고된 메시지 ${reportedMessages.length}개 및 컨텍스트 ${contextMessagesSet.size}개 조회 완료`
        });
        
        console.log(`✅ [신고메시지조회] 조회 완료`);
        
    } catch (error) {
        console.error('❌ [신고메시지조회] 실패:', error);
        res.status(500).json({
            success: false,
            message: '신고된 메시지 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
};



/**
 * 🎯 방 찾기 또는 생성 (통합 API) (별도의 방찾기 함수임)
 * POST /api/chat/rooms/find-or-create
 */
export const findOrCreateRoom = async (req, res) => {
    try {
        const {
            userId,
            roomType,
            capacity,
            matchedGender,
            ageGroup,
            selectedPreference
        } = req.body;

        console.log('🔍 [방찾기/생성] 요청:', {
            userId, roomType, capacity, matchedGender, ageGroup, selectedPreference
        });

        // 1️⃣ 입력 검증
        if (!userId || !roomType || !capacity || !ageGroup) {
            return res.status(400).json({
                success: false,
                error: '필수 파라미터가 누락되었습니다.'
            });
        }

        // 2️⃣ 참가 가능한 방 찾기
        const findResult = await chatService.findAvailableRoom(
            userId,
            roomType,
            capacity,
            matchedGender,
            ageGroup
        );

        if (findResult.success && findResult.room) {
            // 3-A. 방을 찾았으면 참가
            console.log(`✅ [방찾기/생성] 참가 가능한 방 발견: ${findResult.room._id}`);

            try {
                const joinedRoom = await chatService.addUserToRoom(
                    findResult.room._id,
                    userId,
                    selectedPreference,
                    findResult.user  // 캐시된 사용자 정보 재사용
                );

                return res.status(200).json({
                    success: true,
                    action: 'joined',
                    room: { _id: joinedRoom._id },
                    attemptedRooms: findResult.attemptedRooms //로깅용이니 이 줄 지우기
                });
            } catch (joinError) {
                // 참가 실패 (동시 참가 등) → 새로 생성으로 폴백
                console.log(`⚠️ [방찾기/생성] 참가 실패, 새 방 생성: ${joinError.message}`);
            }
        }

        // 3-B. 참가 가능한 방이 없음 → 새로 생성
        console.log('🆕 [방찾기/생성] 새 방 생성');

        const newRoom = await chatService.createChatRoom(
            roomType,
            capacity,
            matchedGender,
            ageGroup
        );

        const joinedNewRoom = await chatService.addUserToRoom(
            newRoom._id,
            userId,
            selectedPreference,
            findResult.user  // 캐시된 사용자 정보 재사용
        );

        return res.status(201).json({
            success: true,
            action: 'created',
            room: { _id: joinedNewRoom._id },
            attemptedRooms: findResult.attemptedRooms || 0 //로깅용이니 이 줄 지우기
        });

    } catch (error) {
        console.error('❌ [방찾기/생성] 오류:', error);

        return res.status(error.status || 500).json({
            success: false,
            error: error.message,
            code: error.code
        });
    }
};

/**
 * 친구방 찾기 또는 생성
 *
 * Route: POST /api/chat/friend/rooms/find-or-create
 *
 * Request Body:
 * {
 *   userId: string,    // 현재 사용자 ID (필수)
 *   friendId: string   // 친구 ID (필수)
 * }
 *
 * Response (성공):
 * {
 *   success: true,
 *   action: 'created' | 'joined',  // 새로 생성 or 기존 방 입장
 *   room: {
 *     _id: string,
 *     chatUsers: string[],
 *     isActive: boolean
 *   }
 * }
 *
 * Response (실패):
 * {
 *   success: false,
 *   error: string,
 *   errorCode: 'USER_NOT_FOUND' | 'BLOCKED_USER' | 'MISSING_PARAMS' | 'INVALID_PARAMS'
 * }
 */
export const findOrCreateFriendRoomController = async (req, res) => {
    try {
        const { userId, friendId } = req.body;

        console.log('🎯 [Controller] findOrCreateFriendRoom 요청:', { userId, friendId });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ 입력 검증
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // 필수 파라미터 체크
        if (!userId || !friendId) {
            return res.status(400).json({
                success: false,
                error: '사용자 ID와 친구 ID가 필요합니다.',
                errorCode: 'MISSING_PARAMS'
            });
        }

        // 자기 자신과 채팅 방지
        if (userId === friendId) {
            return res.status(400).json({
                success: false,
                error: '자기 자신과는 채팅할 수 없습니다.',
                errorCode: 'INVALID_PARAMS'
            });
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ 서비스 호출
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const result = await chatService.findOrCreateFriendRoom(userId, friendId);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ 성공 응답
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 상태 코드: 201 (생성) or 200 (기존 방 사용)
        const statusCode = result.created ? 201 : 200;

        return res.status(statusCode).json({
            success: true,
            action: result.created ? 'created' : 'joined',
            roomId: result.roomId
        });

    } catch (error) {
        console.error('❌ [Controller] findOrCreateFriendRoom 오류:', error);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ 에러 응답 (에러 타입별 상태 코드)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const status = error.status || 500;
        const code = error.code || 'INTERNAL_ERROR';

        return res.status(status).json({
            success: false,
            error: error.message,
            errorCode: code
        });
    }
};

/**
 * 🆕 여러 채팅방의 마지막 메시지 일괄 조회
 * N+1 쿼리 문제 해결: MongoDB Aggregation 사용
 *
 * @route POST /api/chat/messages/batch-last
 * @body { roomIds: string[] } - 조회할 채팅방 ID 배열 (최대 100개)
 * @returns { messages: Array<{ roomId, lastMessage: { text, textTime, sender } }> }
 */
export const getLastMessagesBatch = async (req, res) => {
    try {
        const { roomIds } = req.body;

        // 입력 검증
        if (!Array.isArray(roomIds) || roomIds.length === 0) {
            return res.status(400).json({
                error: 'roomIds는 배열이어야 하며 비어있을 수 없습니다.'
            });
        }

        if (roomIds.length > 100) {
            return res.status(400).json({
                error: '한 번에 최대 100개 채팅방까지 조회 가능합니다.'
            });
        }

        console.log(`📦 [배치조회] ${roomIds.length}개 채팅방의 마지막 메시지 조회 시작`);

        // MongoDB Aggregation으로 N+1 쿼리 해결
        const results = await ChatMessage.aggregate([
            // 1단계: 해당 채팅방들의 메시지만 필터링
            {
                $match: {
                    chatRoom: {
                        $in: roomIds.map(id => new mongoose.Types.ObjectId(id))
                    },
                    isDeleted: false
                }
            },

            // 2단계: 최신순 정렬
            {
                $sort: { createdAt: -1 }
            },

            // 3단계: 채팅방별로 그룹화하여 가장 최신 메시지만 선택
            {
                $group: {
                    _id: '$chatRoom',
                    lastMessage: { $first: '$$ROOT' }  // 가장 최신 메시지
                }
            },

            // 4단계: sender 정보 조인
            {
                $lookup: {
                    from: 'users',
                    localField: 'lastMessage.sender',
                    foreignField: '_id',
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                nickname: 1
                                // profilePhoto는 프론트엔드에서 사용하지 않으므로 제외
                            }
                        }
                    ],
                    as: 'lastMessage.senderInfo'
                }
            },

            // 5단계: sender 배열을 객체로 변환
            {
                $addFields: {
                    'lastMessage.sender': {
                        $arrayElemAt: ['$lastMessage.senderInfo', 0]
                    }
                }
            },

            // 6단계: 필요한 필드만 선택
            {
                $project: {
                    _id: 0,
                    roomId: { $toString: '$_id' },
                    lastMessage: {
                        _id: '$lastMessage._id',
                        text: '$lastMessage.text',
                        textTime: '$lastMessage.textTime',
                        sender: '$lastMessage.sender',
                        isEncrypted: '$lastMessage.isEncrypted',
                        encryptedText: '$lastMessage.encryptedText',
                        iv: '$lastMessage.iv',
                        tag: '$lastMessage.tag',
                        isSystem: '$lastMessage.isSystem'
                    }
                }
            }
        ]);

        // 암호화된 메시지 복호화 처리
        const decryptedResults = results.map(item => {
            try {
                if (item.lastMessage.isEncrypted && item.lastMessage.encryptedText) {
                    // 암호화된 메시지 복호화
                    const decrypted = ChatEncryption.decryptMessage({
                        encryptedText: item.lastMessage.encryptedText,
                        iv: item.lastMessage.iv,
                        tag: item.lastMessage.tag
                    });

                    // 복호화된 텍스트로 교체
                    item.lastMessage.text = decrypted;

                    // 암호화 관련 필드 제거 (클라이언트에 노출 X)
                    delete item.lastMessage.isEncrypted;
                    delete item.lastMessage.encryptedText;
                    delete item.lastMessage.iv;
                    delete item.lastMessage.tag;
                } else {
                    // 평문 메시지는 그대로 유지
                    delete item.lastMessage.isEncrypted;
                    delete item.lastMessage.encryptedText;
                    delete item.lastMessage.iv;
                    delete item.lastMessage.tag;
                }
            } catch (decryptError) {
                console.error(`❌ [배치조회] 복호화 실패: ${item.roomId}`, decryptError);
                // 복호화 실패 시 대체 텍스트 표시
                item.lastMessage.text = '[메시지 로드 실패]';
                delete item.lastMessage.isEncrypted;
                delete item.lastMessage.encryptedText;
                delete item.lastMessage.iv;
                delete item.lastMessage.tag;
            }

            return item;
        });

        console.log(`✅ [배치조회] 완료: ${decryptedResults.length}개 메시지 반환`);

        res.status(200).json({
            messages: decryptedResults
        });

    } catch (error) {
        console.error('❌ [배치조회] 오류:', error);
        res.status(500).json({
            error: '마지막 메시지 일괄 조회 실패',
            details: error.message
        });
    }
};


/**
 * 리엑트 쿼리 캐싱 -> 캐싱한 뒤 오는 대화들 만 로드 할 수 있게 함
 * 증분 동기화용 API
 * lastMessageId 이후의 새 메시지만 반환
 */
export const getNewMessages = async (req, res) => {
    const { roomId } = req.params;
    const { lastMessageId } = req.query;

    if (!roomId) {
        return res.status(400).json({
            success: false,
            error: 'roomId가 필요합니다.',
            messages: []
        });
    }

    try {
        let query = {
            chatRoom: roomId,
            isDeleted: false
        };

        if (lastMessageId) {
            query._id = { $gt: lastMessageId };
        }

        console.log(`📡 [증분 동기화] 조회:`, { roomId, lastMessageId });

        const messages = await ChatMessage.find(query)
            .sort({ textTime: 1 })
            .limit(100)
            .populate('sender', 'nickname profilePhoto')
            .lean();

        console.log(`📊 [증분 동기화] ${messages.length}개 조회`);

        const decryptedMessages = messages.map(msg => {
            if (!msg.isEncrypted || !msg.encryptedText) {
                return msg;
            }

            try {
                const decrypted = ChatEncryption.decryptMessage({
                    encryptedText: msg.encryptedText,
                    iv: msg.iv,
                    tag: msg.tag
                });

                msg.text = decrypted;
                delete msg.encryptedText;
                delete msg.iv;
                delete msg.tag;

            } catch (error) {
                console.error(`❌ 복호화 실패: ${msg._id}`, error);
                msg.text = '[메시지를 불러올 수 없습니다]';
            }

            msg.isEncrypted = false;
            return msg;
        });

        res.json({
            success: true,
            messages: decryptedMessages,
            count: decryptedMessages.length,
            hasMore: decryptedMessages.length === 100
        });

        console.log(`✅ [증분 동기화] ${decryptedMessages.length}개 전송`);

    } catch (error) {
        console.error('❌ [증분 동기화 실패]', error);

        res.status(500).json({
            success: false,
            error: error.message || '메시지 조회 중 오류가 발생했습니다.',
            messages: [],
            count: 0
        });
    }
};