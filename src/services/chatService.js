import {ChatRoom, ChatMessage, ChatRoomExit, RoomEntry} from '../models/chat.js';
import {User} from "../models/UserProfile.js";
import { ChatRoomHistory } from "../models/chatRoomHistory.js";
import ChatEncryption from '../utils/encryption/chatEncryption.js';
import ComprehensiveEncryption from '../utils/encryption/comprehensiveEncryption.js';
import ReportedMessageBackup from '../models/reportedMessageBackup.js';
import { filterProfanity } from '../utils/profanityFilter.js';

/**
 * 새로운 채팅방 생성
 */
export const createChatRoom = async (roomType, capacity, matchedGender, ageGroup) => {
    try {
        console.log('🏠 [createChatRoom] 요청 매개변수:');
        console.log(`  - roomType: ${roomType}`);
        console.log(`  - capacity: ${capacity}`);
        console.log(`  - matchedGender: ${matchedGender}`);
        console.log(`  - ageGroup: "${ageGroup}" (type: ${typeof ageGroup})`);
        
        // 1) 방 생성
        const newChatRoom = new ChatRoom({ roomType, capacity, matchedGender, ageGroup });
        const saved = await newChatRoom.save();

        console.log('✅ [createChatRoom] 방 생성 성공:', saved._id);
        return saved;
    } catch (error) {
        // 에러 스택까지 찍어서 어디서 터졌는지 확인
        console.error('[chatService.createChatRoom] error:', error);
        throw error;
    }
};

// 친구와 채팅방 생성
export const createFriendRoom = async (roomType, capacity) => {
    try {
        const newChatRoom = new ChatRoom({
            roomType,
            capacity
        });
        return await newChatRoom.save();
    } catch (error) {
        throw new Error(error.message);
    }
}

/**
 * 특정 채팅방 조회
 */
export const getChatRoomById = async (roomId) => {
    return await ChatRoom.findById(roomId).populate('chatUsers');
};

/**
 * 모든 채팅방 목록 조회 (서버측 필터링 및 페이징 적용)
 * @param {object} filters - 쿼리 파라미터 객체 (roomType, capacity, matchedGender, ageGroup, status, page, limit 등)
 */
export const getAllChatRooms = async (filters) => {
    const query = {};
    if (filters.chatUsers) {
        query.chatUsers = filters.chatUsers;
    }

    // 차단된 사용자 포함 방 제외
    if (filters.userId) {
        const me = await User.findById(filters.userId).select('blockedUsers');
        const exited = await ChatRoomExit.distinct('chatRoom', { user: filters.userId });
        if (exited.length) query._id = { $nin: exited };   // 이미 나간 방 제외
        if (me && me.blockedUsers.length > 0) {
            query.chatUsers = { $nin: me.blockedUsers };
        }
    }

    if (filters.roomType)    query.roomType     = filters.roomType;
    if (filters.capacity)    query.capacity     = parseInt(filters.capacity);
    if (filters.matchedGender) query.matchedGender = filters.matchedGender;
    if (filters.ageGroup)    query.ageGroup     = filters.ageGroup;

    const page  = parseInt(filters.page)  || 1;
    const limit = parseInt(filters.limit) || 10;
    const skip  = (page - 1) * limit;

    // 🔧 blockedUsers 필드도 함께 populate (차단 관계 확인용)
    const rooms = await ChatRoom.find(query)
        .populate('chatUsers', 'nickname gender blockedUsers profilePhoto lolNickname star info photo')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    return rooms;
};

/**
 * 채팅방에 사용자 추가
 * @param {string} roomId - 채팅방 ID
 * @param {string} userId - 사용자 ID
 * @param {string} selectedGender - 선택한 성별 카테고리 (opposite/any/same)
 */
export const addUserToRoom = async (roomId, userId, selectedGender = null) => {
    try {

        // 1) 방  현재 참가자들의 blockedUsers 정보 조회
        const room = await ChatRoom.findById(roomId)
            .populate('chatUsers', 'blockedUsers')   // ← 추가
            .exec();
        if (!room) {
            throw new Error('채팅방을 찾을 수 없습니다.');
        }

        /* 🔒 이미 퇴장한 적이 있으면 재입장 금지 */
        const hasExited = await ChatRoomExit.exists({                    // [3]
            chatRoom: roomId, user: userId
        });
        if (hasExited) {
            const err = new Error('이미 퇴장한 채팅방입니다.');
            err.status = 403;
            throw err;                                                     // controller에서 그대로 전송
        }

        // 2) 입장하려는 사용자 본인의 blockedUsers 가져오기
        const joiner = await User.findById(userId).select('blockedUsers birthdate');
        if (!joiner) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }

        // 🔞 나이 검증 로직 추가
        if (room.roomType === 'random' && room.ageGroup) {
            // User 모델의 virtual 필드를 통한 나이 계산
            const joinerAge = joiner.calculatedAge; // virtual 필드 사용
            const joinerIsMinor = joiner.isMinor;    // virtual 필드 사용
            
            // 생년월일이 없는 경우 차단
            if (!joiner.birthdate) {
                const err = new Error('랜덤채팅 이용을 위해서는 생년월일 정보가 필요합니다.');
                err.status = 403;
                err.code = 'BIRTHDATE_REQUIRED';
                throw err;
            }
            
            // 나이 계산 실패 시 차단
            if (joinerAge === null) {
                const err = new Error('나이 확인이 불가능하여 안전을 위해 입장을 제한합니다.');
                err.status = 403;
                err.code = 'AGE_VERIFICATION_FAILED';
                throw err;
            }
            
            // 채팅방 연령대와 사용자 연령대 매칭 확인
            const joinerAgeGroup = joinerIsMinor ? 'minor' : 'adult';
            
            if (room.ageGroup !== joinerAgeGroup) {
                const roomType = room.ageGroup === 'minor' ? '미성년자' : '성인';
                const userType = joinerAgeGroup === 'minor' ? '미성년자' : '성인';
                
                const err = new Error(`${roomType} 전용 채팅방입니다. (현재: ${userType})`);
                err.status = 403;
                err.code = 'AGE_GROUP_MISMATCH';
                throw err;
            }
            
            console.log(`✅ 나이 검증 통과: ${joinerAge}세 (${joinerAgeGroup}) → ${room.ageGroup} 채팅방`);
        }

        // 3) 차단 관계 양방향 검사
        const blockedByMe = room.chatUsers.some(u =>
            joiner.blockedUsers.includes(u._id)
        );
        const blockedMe = room.chatUsers.some(u =>
            u.blockedUsers.includes(userId)
        );

        if (blockedByMe || blockedMe) {
            const err = new Error('차단 관계가 있는 사용자와 함께할 수 없습니다.');
            err.status = 403;          // 컨트롤러에서 그대로 사용
            throw err;
        }

        // 4) 기존 로직 유지 ― 실제로 방에 추가
        if (!room.chatUsers.includes(userId)) {
            room.chatUsers.push(userId);

            // 🔧 랜덤채팅에서 성별 선택 정보 저장
            if (room.roomType === 'random') {
                // selectedGender가 없으면 방의 matchedGender를 기본값으로 사용
                const genderToSave = selectedGender || room.matchedGender || 'any';
                room.genderSelections.set(userId.toString(), genderToSave);
                console.log(`성별 선택 저장: ${userId} → ${genderToSave}`);
            }

            if (room.roomType === 'random' && room.chatUsers.length >= room.capacity) {
                room.isActive = true;
                room.status = 'active';
                return await room.save();
            }
        }
        await room.save();
        return room;
    } catch (error) {
        throw error;
    }
};

// ============================================================================
//   🔐 메시지 저장 시스템 (통합 및 최적화 완료)
//   - 암호화/평문 자동 선택
//   - sender 타입 오류 해결됨
//   - 환경변수 기반 동적 전환
// ============================================================================

/**
 * 🔄 통합 메시지 저장 함수 (암호화 설정에 따라 자동 선택)
 * @param {string} chatRoom - 채팅방 ID
 * @param {string} senderId - 발송자 ID  
 * @param {string} text - 메시지 텍스트
 * @param {Object} metadata - 메타데이터 (선택적)
 * @returns {Object} 저장된 메시지 객체
 */
export const saveMessage = async (chatRoom, senderId, text, metadata = {}) => {
    try {
        // 1. senderId 유효성 검증
        if (!senderId) {
            throw new Error('senderId는 필수입니다.');
        }

        // 2. 환경변수로 암호화 여부 결정
        const encryptionEnabled = process.env.CHAT_ENCRYPTION_ENABLED === 'true';
        
        const messageData = {
            roomId: chatRoom,
            senderId: senderId,
            text: text, // 원본 텍스트 사용 (필터링 제거)
            metadata: metadata
        };
        
        if (encryptionEnabled) {
            console.log('🔐 [메시지저장] 암호화 모드로 저장 (원본)');
            return await saveEncryptedMessage(messageData);
        } else {
            console.log('📝 [메시지저장] 평문 모드로 저장 (원본)');
            // 기존 방식 유지 (하위 호환성)
            const newMessage = new ChatMessage({
                chatRoom,
                sender: senderId,
                text: text, // 원본 텍스트 사용 (필터링 제거)
                isEncrypted: false, // 명시적으로 평문임을 표시
                readBy: [{
                    user: senderId,
                    readAt: new Date()
                }]
            });
            return await newMessage.save();
        }
        
    } catch (error) {
        console.error('❌ [메시지저장] 통합 저장 실패:', error);
        throw error;
    }
};

/**
 * 🔐 암호화된 메시지 저장
 * @param {Object} messageData - 메시지 데이터
 * @param {string} messageData.roomId - 채팅방 ID
 * @param {string} messageData.senderId - 발송자 ID  
 * @param {string} messageData.text - 메시지 텍스트
 * @param {Object} messageData.metadata - 메타데이터 (선택적)
 * @returns {Object} 저장된 메시지 객체
 */
export const saveEncryptedMessage = async (messageData) => {
    try {
        const { roomId, senderId, text, metadata = {} } = messageData;
        
        console.log(`🔐 [메시지저장] 암호화 저장 시작: "${text.substring(0, 20)}..."`); 
        
        // 1. 키워드 추출 (암호화 전)
        const keywords = ChatEncryption.extractKeywords(text);
        const hashedKeywords = keywords.map(k => ChatEncryption.hashKeyword(k));
        
        // 2. 메시지 전체 해시 (중복 검출용)
        const messageHash = ChatEncryption.hashMessage(text);
        
        // 3. 메시지 암호화
        const encryptedData = ChatEncryption.encryptMessage(text);
        
        // 4. 메시지 저장
        const message = new ChatMessage({
            chatRoom: roomId,
            sender: senderId, // ObjectId만 저장 (버그 수정됨)
            
            // text 필드는 생략 (isEncrypted: true이므로 required: false)
            
            // 암호화 필드들
            isEncrypted: true,
            encryptedText: encryptedData.encryptedText,
            iv: encryptedData.iv,
            tag: encryptedData.tag,
            
            // 검색용 필드들
            keywords: hashedKeywords,
            messageHash: messageHash,
            
            // 읽음 처리 (발송자는 자동으로 읽음)
            readBy: [{
                user: senderId,
                readAt: new Date()
            }],
            
            // 메타데이터
            metadata: {
                platform: metadata.platform || 'web',
                userAgent: metadata.userAgent || 'unknown',
                ipHash: metadata.ipHash || null
            }
        });
        
        const savedMessage = await message.save();
        
        console.log(`✅ [메시지저장] 암호화 저장 완료: ${savedMessage._id}`);
        console.log(`  📊 키워드: ${keywords.length}개, 해시: ${hashedKeywords.length}개`);
        
        return savedMessage;
        
    } catch (error) {
        console.error('❌ [메시지저장] 암호화 저장 실패:', error);
        throw new Error('암호화된 메시지 저장에 실패했습니다: ' + error.message);
    }
};

// /**
//  * 🚨 신고된 메시지 백업 생성 (법적 대응용)
//  * @param {string} messageId - 메시지 ID
//  * @param {Object} reportData - 신고 데이터
//  * @returns {Object} 백업 생성 결과
//  */
// export const createReportedMessageBackup = async (messageId, reportData) => {
//     try {
//         const message = await ChatMessage.findById(messageId);
//         if (!message) {
//             throw new Error('신고할 메시지를 찾을 수 없습니다');
//         }
//
//         let plaintextContent;
//
//         // 암호화된 메시지인 경우 복호화
//         if (message.isEncrypted && message.encryptedText) {
//             const encryptedData = {
//                 encryptedText: message.encryptedText,
//                 iv: message.iv,
//                 tag: message.tag
//             };
//             plaintextContent = ChatEncryption.decryptMessage(encryptedData);
//         } else {
//             plaintextContent = message.text || '[내용 없음]';
//         }
//
//         // 기존 백업이 있는지 확인
//         const existingBackup = await ReportedMessageBackup.findOne({
//             originalMessageId: messageId
//         });
//
//         let backup;
//         if (existingBackup) {
//             // 이미 백업이 있으면 신고자만 추가
//             if (!existingBackup.reportedBy.includes(reportData.reportedBy)) {
//                 existingBackup.reportedBy.push(reportData.reportedBy);
//             }
//             existingBackup.reportReason = reportData.reason || 'other';
//             backup = await existingBackup.save();
//         } else {
//             // 새 백업 생성
//             backup = new ReportedMessageBackup({
//                 originalMessageId: messageId,
//                 plaintextContent: plaintextContent,
//                 reportedBy: reportData.reportedBy,
//                 reportReason: reportData.reason || 'other',
//                 backupReason: 'legal_compliance',
//                 retentionUntil: new Date(Date.now() + (3 * 365 * 24 * 60 * 60 * 1000)) // 3년 보관
//             });
//             backup = await backup.save();
//         }
//
//         // 원본 메시지에 신고 표시
//         message.isReported = true;
//         message.reportedAt = new Date();
//         if (!message.reportedBy) message.reportedBy = [];
//         if (!message.reportedBy.includes(reportData.reportedBy)) {
//             message.reportedBy.push(reportData.reportedBy);
//         }
//         await message.save();
//
//         return {
//             success: true,
//             messageId: messageId,
//             contentLength: plaintextContent.length,
//             reportedBy: reportData.reportedBy,
//             backupCreated: true,
//             backupId: backup._id,
//             backupCreatedAt: new Date(),
//             retentionUntil: backup.retentionUntil
//         };
//
//     } catch (error) {
//         console.error('신고 메시지 백업 생성 실패:', error);
//         throw new Error('신고 메시지 백업 생성 실패: ' + error.message);
//     }
// };



/**
 * 메시지를 읽음으로 표시
 */
export const markMessagesAsRead = async (roomId, userId) => {
    try {
        // 해당 채팅방에서 본인이 보내지 않은 메시지들 중 아직 읽지 않은 메시지들을 읽음 처리
        const result = await ChatMessage.updateMany(
            {
                chatRoom: roomId,
                sender: { $ne: userId }, // 본인이 보낸 메시지 제외
                'readBy.user': { $ne: userId } // 아직 읽지 않은 메시지만
            },
            {
                $push: {
                    readBy: {
                        user: userId,
                        readAt: new Date()
                    }
                }
            }
        );

        return result;
    } catch (error) {
        throw new Error(`메시지 읽음 처리 실패: ${error.message}`);
    }
};

/**
 * 특정 메시지를 읽음으로 표시
 */
export const markSingleMessageAsRead = async (messageId, userId) => {
    try {
        const result = await ChatMessage.findByIdAndUpdate(
            messageId,
            {
                $addToSet: {
                    readBy: {
                        user: userId,
                        readAt: new Date()
                    }
                }
            },
            { new: true }
        );

        return result;
    } catch (error) {
        throw new Error(`단일 메시지 읽음 처리 실패: ${error.message}`);
    }
};

/**
 * 채팅방의 안읽은 메시지 개수 조회
 */
export const getUnreadMessageCount = async (roomId, userId) => {
    try {
        const count = await ChatMessage.countDocuments({
            chatRoom: roomId,
            sender: { $ne: userId }, // 본인이 보낸 메시지 제외
            'readBy.user': { $ne: userId } // 읽지 않은 메시지만
        });

        return count;
    } catch (error) {
        throw new Error(`안읽은 메시지 개수 조회 실패: ${error.message}`);
    }
};

/**
 * 채팅방 입장 시간 기록
 */
export const recordRoomEntry = async (roomId, userId, entryTime = null) => {
    try {
        const timestamp = entryTime ? new Date(entryTime) : new Date();

        // 기존 입장 기록이 있는지 확인
        const existingEntry = await RoomEntry.findOne({
            room: roomId,
            user: userId
        });

        if (existingEntry) {
            // 기존 기록 업데이트
            existingEntry.entryTime = timestamp;
            existingEntry.lastActiveTime = timestamp;
            await existingEntry.save();

            return {
                success: true,
                entryTime: existingEntry.entryTime,
                isUpdate: true
            };
        } else {
            // 새 입장 기록 생성
            const newEntry = new RoomEntry({
                room: roomId,
                user: userId,
                entryTime: timestamp,
                lastActiveTime: timestamp
            });

            await newEntry.save();

            return {
                success: true,
                entryTime: newEntry.entryTime,
                isUpdate: false
            };
        }
    } catch (error) {
        throw new Error(`채팅방 입장 시간 기록 실패: ${error.message}`);
    }
};

/**
 * ⚠️ 기존 메시지 저장 함수 (deprecated - sender 타입 오류)
 * 이 주석된 코드는 "sender에 객체 전체를 할당하는 치명적 버그"를 보여줍니다.
 * 스키마에서 sender 필드는 ObjectId 타입인데, 여기서는 전체 사용자 객체를 할당하려 했습니다.
 * 이로 인해 "CastError: Cast to ObjectId failed for value '[object Object]'" 에러가 발생했습니다.
 * 
 * ✅ 해결책: sender 필드에는 ObjectId(senderId)만 저장하고,
 * 프로필 정보가 필요하면 populate()를 사용하거나 별도 필드에 저장해야 합니다.
 */
// export const saveMessage = async (chatRoom, sender, text) => {
//     try {
//         // ❌ 이 부분이 문제였음 - 객체를 ObjectId 필드에 할당
//         if (typeof sender === 'string') {
//             const user = await User.findById(sender);
//             if (!user) {
//                 throw new Error('사용자를 찾을 수 없습니다.');
//             }
//             sender = { _id: user._id,  // ❌ 이것이 스키마 타입 불일치 원인
//                 nickname: user.nickname,
//                 lolNickname: user.lolNickname,
//                 gender: user.gender,
//                 star: user.star,
//                 info: user.info,
//                 photo: user.photo};
//         }
//
//         const newMessage = new ChatMessage({
//             chatRoom,
//             sender, // ❌ 여기서 객체가 ObjectId 필드에 들어감
//             text,
//             readBy: [{
//                 user: sender._id,
//                 readAt: new Date()
//             }]
//         });
//
//         return await newMessage.save();
//     } catch (error) {
//         throw new Error(error.message);
//     }
// };

/**
 * 🔄 통합 메시지 저장 함수 (암호화 설정에 따라 자동 선택)
 * @param {string} chatRoom - 채팅방 ID
 * @param {string} senderId - 발송자 ID  
 * @param {string} text - 메시지 텍스트
 * @param {Object} metadata - 메타데이터 (선택적)
 * @returns {Object} 저장된 메시지 객체
 */


/**
 * 🔐 암호화된 메시지 저장
 * @param {Object} messageData - 메시지 데이터
 * @param {string} messageData.roomId - 채팅방 ID
 * @param {string} messageData.senderId - 발송자 ID  
 * @param {string} messageData.text - 메시지 텍스트
 * @param {Object} messageData.metadata - 메타데이터 (선택적)
 * @returns {Object} 저장된 메시지 객체
 */


/**
 * 특정 채팅방의 메시지 가져오기 (사용자용 - 자동 복호화)
 * @param {string} roomId - 채팅방 ID
 * @param {boolean} includeDeleted - true면 isDeleted 플래그에 관계없이 모두 조회
 * @param {number} page - 페이지 번호
 * @param {number} limit - 페이지당 메시지 수
 * @param {string} requestUserId - 요청한 사용자 ID (권한 확인용)
 * @returns {Object} 복호화된 메시지 목록
 */
export const getMessagesByRoom = async (roomId, includeDeleted = false, page = 1, limit = 20, requestUserId = null) => {
    const filter = includeDeleted
        ? { chatRoom: roomId }
        : { chatRoom: roomId, isDeleted: false };

    const room = await ChatRoom.findById(roomId).select('roomType chatUsers').lean();
    
    // 권한 확인: 요청한 사용자가 해당 채팅방에 속해있는지 확인
    if (requestUserId && room && !room.chatUsers.some(userId => userId.toString() === requestUserId.toString())) {
        throw new Error('해당 채팅방에 접근할 권한이 없습니다.');
    }

    let messages;
    let pagination;

    // 친구 채팅에만 시간 제한 및 페이지네이션 적용
    if (room && room.roomType === 'friend') {
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
        filter.createdAt = { $gte: twoDaysAgo };

        const totalMessages = await ChatMessage.countDocuments(filter);
        const totalPages = Math.ceil(totalMessages / limit);
        const skip = (page - 1) * limit;

        messages = await ChatMessage.find(filter)
            .populate('sender')
            .populate('readBy.user', 'nickname')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .exec();

        pagination = {
            currentPage: page,
            totalPages,
            totalMessages,
            hasNextPage: page < totalPages
        };
        
        messages = messages.reverse();
    } else {
        // 그 외 채팅방(랜덤 채팅 등)은 모든 메시지를 한 번에 반환
        messages = await ChatMessage.find(filter)
            .populate('sender')
            .populate('readBy.user', 'nickname')
            .sort({ createdAt: 1 })
            .exec();
        
        pagination = {
            currentPage: 1,
            totalPages: 1,
            totalMessages: messages.length,
            hasNextPage: false
        };
    }

    // 🔓 메시지 복호화 처리 (사용자용)
    const decryptedMessages = await Promise.all(
        messages.map(async (message) => {
            const messageObj = message.toObject();
            
            try {
                // 암호화된 메시지인 경우 복호화
                if (messageObj.isEncrypted && messageObj.encryptedText) {
                    const encryptedData = {
                        encryptedText: messageObj.encryptedText,
                        iv: messageObj.iv,
                        tag: messageObj.tag
                    };
                    
                    // ChatEncryption을 사용해 복호화
                    const decryptedText = ChatEncryption.decryptMessage(encryptedData);
                    
                    // 암호화 관련 필드는 클라이언트에 노출하지 않음
                    delete messageObj.encryptedText;
                    delete messageObj.iv;
                    delete messageObj.tag;
                    delete messageObj.keywords;
                    delete messageObj.messageHash;
                    
                    // 복호화된 텍스트를 text 필드에 설정
                    messageObj.text = filterProfanity(decryptedText); // ✅ 필터링 추가
                    messageObj.isEncrypted = false; // 클라이언트에는 복호화된 상태로 전달
                    
                    // 성능 최적화: 메시지 복호화 로그는 디버그 모드에서만 출력
                    if (process.env.NODE_ENV === 'development' && process.env.LOG_LEVEL === 'debug') {
                        console.log(`🔓 [메시지조회] 복호화 완료: ${messageObj._id} -> "${decryptedText.substring(0, 20)}..."`);  
                    }
                } else {
                    // 평문 메시지는 필터링 추가
                    messageObj.text = filterProfanity(messageObj.text || ''); // ✅ 필터링 추가
                    if (process.env.NODE_ENV === 'development' && process.env.LOG_LEVEL === 'debug') {
                        console.log(`📝 [메시지조회] 평문 메시지: ${messageObj._id} -> "${(messageObj.text || '').substring(0, 20)}..."`);  
                    }
                }
                
                return messageObj;
                
            } catch (decryptError) {
                console.error(`❌ [메시지조회] 복호화 실패: ${messageObj._id}`, decryptError);
                
                // 복호화 실패 시 오류 메시지로 대체
                messageObj.text = '[메시지를 불러올 수 없습니다]';
                messageObj.isEncrypted = false;
                messageObj.isError = true;
                
                // 암호화 관련 필드 제거
                delete messageObj.encryptedText;
                delete messageObj.iv;
                delete messageObj.tag;
                delete messageObj.keywords;
                delete messageObj.messageHash;
                
                return messageObj;
            }
        })
    );

    // API 응답 형식을 통일하여 반환
    return {
        messages: decryptedMessages,
        pagination: pagination
    };
};

/**
 * 채팅 메시지 삭제
 */
export const softDeleteMessage = async (messageId) => {
    try {
        const message = await ChatMessage.findById(messageId);
        if (!message) throw new Error('메시지를 찾을 수 없습니다.');

        message.isDeleted = true;
        await message.save();
        return message;
    } catch (error) {
        throw new Error(error.message);
    }
};


/**
 * 채팅방에서 사용자 제거
 */
export const leaveChatRoomService = async (roomId, userId) => {
    try {
        /* ① 방 조회 */
        const chatRoom = await ChatRoom.findById(roomId);
        if (!chatRoom) throw new Error('채팅방을 찾을 수 없습니다.');

        /* ② phase 결정 : waiting | active */
        const phase = chatRoom.status === 'waiting' ? 'waiting' : 'active';

        /* ③ Exit 레코드 upsert */
        let exit = await ChatRoomExit.findOne({ chatRoom: roomId, user: userId });
        if (!exit) {
            exit = await ChatRoomExit.create({ chatRoom: roomId, user: userId, phase });
        } else if (exit.phase !== phase) {
            exit.phase = phase;          // waiting → active 로 승격
            await exit.save();
        }

        /* ④ 단계별 참가자 배열 처리 */
        if (phase === 'waiting') {
            chatRoom.chatUsers = chatRoom.chatUsers.filter(
                uid => uid.toString() !== userId.toString()
            );
            await chatRoom.save();       // 빈 슬롯 반영
        }
        // active 단계는 배열 유지(매너 평가용)

        /* ⑤ 방 삭제 판단 */
        let shouldDelete = false;
        if (phase === 'waiting') {
            shouldDelete = chatRoom.chatUsers.length === 0;
        } else {
            const activeExitCnt = await ChatRoomExit.countDocuments({
                chatRoom: roomId,
                phase:    'active'
            });
            shouldDelete = activeExitCnt >= chatRoom.capacity;
        }

        /* ⑥ 정리 & 삭제 */
        if (shouldDelete) {
            await ChatRoomHistory.create({
                chatRoomId: chatRoom._id,
                meta: {
                    chatUsers:     chatRoom.chatUsers,
                    capacity:      chatRoom.capacity,
                    roomType:      chatRoom.roomType,
                    matchedGender: chatRoom.matchedGender,
                    ageGroup:      chatRoom.ageGroup,
                    createdAt:     chatRoom.createdAt,
                    genderSelections: Object.fromEntries(chatRoom.genderSelections)
                }
            });
            await ChatRoom.deleteOne({ _id: roomId });
            await ChatRoomExit.deleteMany({ chatRoom: roomId });
        }

        return { success: true, message: '채팅방에서 나갔습니다.' };
    } catch (err) {
        console.error('[leaveChatRoomService] error:', err);
        throw err;
    }
};

/**
 * 랜덤채팅 히스토리 조회
 * @param {{ 'meta.chatUsers': string, page?: number, size?: number }} filters
 */
export const getChatRoomHistory = async (filters) => {
    const page = parseInt(filters.page) || 1;
    const size = parseInt(filters.size) || 100;
    const skip = (page - 1) * size;

    // 🔧 필터 조건을 동적으로 구성
    const query = {};

    // meta.chatUsers 필터가 있을 때만 적용
    if (filters['meta.chatUsers']) {
        query['meta.chatUsers'] = filters['meta.chatUsers'];
    }

    console.log('📋 히스토리 쿼리 조건:', query);

    const histories = await ChatRoomHistory
        .find(query)  // 🔧 동적 쿼리 사용
        .lean()
        .populate('meta.chatUsers', 'nickname gender social.kakao.gender social.naver.gender')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(size);

    console.log('📦 조회된 히스토리 개수:', histories.length);

    // 🔧 genderSelections 정보를 개별 사용자에게 매핑
    const processedHistories = histories.map(history => {
        if (history.meta && history.meta.genderSelections && history.meta.chatUsers) {
            const chatUsersWithGender = history.meta.chatUsers.map(user => ({
                ...user,
                selectedGender: history.meta.genderSelections[user._id.toString()] || null
            }));

            return {
                ...history,
                meta: {
                    ...history.meta,
                    chatUsersWithGender // 새로운 필드 추가
                }
            };
        }
        return history;
    });

    return processedHistories;
};



/**
 * 사용자 exit 기록을 기반으로 종료한 채팅방 ID 목록 조회
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Array>} - 종료한 채팅방 ID 배열
 */
export const getUserLeftRooms = async (userId) => {
    try {
        const leftRooms = await ChatRoomExit.distinct('chatRoom', { user: userId });
        return leftRooms;
    } catch (error) {
        throw new Error(error.message);
    }
};
// isActive 토글
export const setRoomActive = async (roomId, active) => {
    const room = await ChatRoom.findById(roomId);
    if (!room) throw new Error('채팅방을 찾을 수 없습니다.');
    room.isActive = active;
    return await room.save();
};

export const saveSystemMessage = async (roomId, text) => {
    const msg = new ChatMessage({ chatRoom: roomId, sender: null, text, isSystem: true });
    return await msg.save();
};

// ============================================================================
//   🧪 채팅 암호화 관련 유틸리티 함수들 (완성됨)
// ============================================================================

/**
 * 🧪 채팅 암호화 시스템 테스트 (개발자용)
 */
export const testChatEncryption = async () => {
    try {
        console.log('🧪 [시스템테스트] 채팅 암호화 통합 테스트 시작...');
        
        // 1. ChatEncryption 성능 테스트
        const encryptionTest = ChatEncryption.performanceTest();
        
        if (!encryptionTest.success) {
            throw new Error('암호화 기본 테스트 실패');
        }
        
        // 2. 메시지 저장 테스트 (실제 DB 저장하지 않음)
        const testMessageData = {
            roomId: '507f1f77bcf86cd799439011', // 더미 ObjectId
            senderId: '507f1f77bcf86cd799439012', // 더미 ObjectId  
            text: '테스트 메시지입니다! Hello 123 암호화 테스트'
        };
        
        console.log('💾 [시스템테스트] 메시지 저장 로직 테스트...');
        
        // 암호화 필드 생성 테스트 (실제 저장하지 않음)
        const keywords = ChatEncryption.extractKeywords(testMessageData.text);
        const hashedKeywords = keywords.map(k => ChatEncryption.hashKeyword(k));
        const messageHash = ChatEncryption.hashMessage(testMessageData.text);
        const encryptedData = ChatEncryption.encryptMessage(testMessageData.text);
        
        console.log('✅ [시스템테스트] 결과:');
        console.log(`  🔐 암호화: ${encryptionTest.encryptTime}ms`);
        console.log(`  🔓 복호화: ${encryptionTest.decryptTime}ms`);
        console.log(`  📝 키워드 추출: ${keywords.length}개 (${keywords.join(', ')})`);
        console.log(`  🔗 해시 키워드: ${hashedKeywords.length}개`);
        console.log(`  🔒 메시지 해시: ${messageHash.substring(0, 16)}...`);
        console.log(`  📦 암호화 데이터 크기: ${encryptedData.encryptedText.length} chars`);
        
        return {
            success: true,
            encryptionTest,
            keywordCount: keywords.length,
            hashCount: hashedKeywords.length,
            encryptedSize: encryptedData.encryptedText.length
        };
        
    } catch (error) {
        console.error('❌ [시스템테스트] 실패:', error);
        return { success: false, error: error.message };
    }
};

/**
 * 관리자용 메시지 조회 (암호화 상태 그대로)
 * @param {string} roomId - 채팅방 ID
 * @param {boolean} includeDeleted - 삭제된 메시지 포함 여부
 * @param {number} page - 페이지 번호
 * @param {number} limit - 페이지당 메시지 수
 * @returns {Object} 암호화 상태 그대로의 메시지 목록 (관리자용)
 */
export const getMessagesByRoomForAdmin = async (roomId, includeDeleted = false, page = 1, limit = 20) => {
    const filter = includeDeleted
        ? { chatRoom: roomId }
        : { chatRoom: roomId, isDeleted: false };

    const room = await ChatRoom.findById(roomId).select('roomType').lean();

    // 친구 채팅에만 시간 제한 및 페이지네이션 적용
    if (room && room.roomType === 'friend') {
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
        filter.createdAt = { $gte: twoDaysAgo };

        const totalMessages = await ChatMessage.countDocuments(filter);
        const totalPages = Math.ceil(totalMessages / limit);
        const skip = (page - 1) * limit;

        const messages = await ChatMessage.find(filter)
            .populate('sender')
            .populate('readBy.user', 'nickname')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .exec();

        return {
            messages: messages.reverse(),
            pagination: {
                currentPage: page,
                totalPages,
                totalMessages,
                hasNextPage: page < totalPages
            }
        };
    }

    // 그 외 채팅방(랜덤 채팅 등)은 모든 메시지를 한 번에 반환 (기존 방식)
    const messages = await ChatMessage.find(filter)
        .populate('sender')
        .populate('readBy.user', 'nickname')
        .sort({ createdAt: 1 })
        .exec();
    
    // 관리자용: 암호화 상태 그대로 반환 (복호화하지 않음)
    console.log(`🔧 [관리자조회] 암호화 상태로 ${messages.length}개 메시지 반환`);
    
    return {
        messages: messages,
        pagination: {
            currentPage: 1,
            totalPages: 1,
            totalMessages: messages.length,
            hasNextPage: false
        }
    };
};

// ============================================================================
//   🚨 신고된 메시지 백업 시스템 (법적 대응용)
// ============================================================================

/**
 * 신고된 메시지 백업 생성 (법적 대응용)
 * @param {string} messageId - 신고된 메시지 ID
 * @param {object} reportData - 신고 정보 { reportedBy, reason, reportId }
 * @returns {object} 백업 생성 결과
 */
export const createReportedMessageBackup = async (messageId, reportData) => {
    try {
        console.log(`🔒 [백업생성] 시작: ${messageId}`);
        console.log(`🔒 [백업생성] reportData:`, reportData);
        
        // 1. 원본 메시지 조회
        const originalMessage = await ChatMessage.findById(messageId)
            .populate('sender', 'nickname')
            .lean();
            
        if (!originalMessage) {
            console.error(`❌ [백업생성] 메시지 없음: ${messageId}`);
            throw new Error('원본 메시지를 찾을 수 없습니다');
        }
        
        console.log(`📄 [백업생성] 메시지 정보:`, {
            _id: originalMessage._id,
            isEncrypted: originalMessage.isEncrypted,
            hasText: !!originalMessage.text,
            hasEncryptedText: !!originalMessage.encryptedText
        });
        
        // 2. 이미 백업이 존재하는지 확인
        let backup = await ReportedMessageBackup.findOne({ 
            originalMessageId: messageId 
        });
        
        console.log(`🔍 [백업생성] 기존 백업 존재:`, !!backup);
        
        let plaintextContent = '';
        
        // 3. 메시지 복호화 (암호화된 경우)
        if (originalMessage.isEncrypted && originalMessage.encryptedText) {
            try {
                console.log('🔐 [백업생성] 암호화된 메시지 복호화 시도...');
                
                // ✅ ChatEncryption 사용 (채팅 전용)
                const encryptedData = {
                    encryptedText: originalMessage.encryptedText,
                    iv: originalMessage.iv,
                    tag: originalMessage.tag
                };
                
                plaintextContent = ChatEncryption.decryptMessage(encryptedData);
                
                console.log(`✅ [백업생성] 복호화 성공, 길이: ${plaintextContent.length}`);
            } catch (decryptError) {
                console.error('❌ [백업생성] 복호화 실패:', decryptError.message);
                console.error('❌ [백업생성] 복호화 스택:', decryptError.stack);
                plaintextContent = `[복호화 실패] Error: ${decryptError.message} | 암호화 데이터 길이: ${originalMessage.encryptedText?.length || 0}`;
            }
        } else {
            // 평문 메시지인 경우
            plaintextContent = originalMessage.text || '[메시지 내용 없음]';
            console.log(`📝 [백업생성] 평문 메시지, 길이: ${plaintextContent.length}`);
        }
        
        if (backup) {
            // 4. 기존 백업이 있으면 신고자만 추가
            console.log(`♻️ [백업생성] 기존 백업 업데이트`);
            
            if (!backup.reportedBy.includes(reportData.reportedBy)) {
                backup.reportedBy.push(reportData.reportedBy);
                await backup.save();
                console.log('✅ [백업생성] 신고자 추가 완료');
            } else {
                console.log('ℹ️ [백업생성] 이미 신고한 사용자');
            }
        } else {
            // 5. 새 백업 생성
            console.log(`🆕 [백업생성] 새 백업 생성`);
            
            const retentionDate = new Date();
            retentionDate.setFullYear(retentionDate.getFullYear() + 3); // 3년 후
            
            backup = new ReportedMessageBackup({
                originalMessageId: messageId,
                plaintextContent: plaintextContent,
                reportedBy: [reportData.reportedBy],
                reportReason: reportData.reason || 'other',  // ✅ enum 값
                backupReason: 'legal_compliance',
                retentionUntil: retentionDate
            });
            
            const saved = await backup.save();
            console.log('✅ [백업생성] 저장 완료, _id:', saved._id);
        }
        
        // ✅ 저장 확인
        const verifyBackup = await ReportedMessageBackup.findOne({ 
            originalMessageId: messageId 
        });
        
        console.log(`🔍 [백업생성] 저장 검증:`, {
            exists: !!verifyBackup,
            backupId: verifyBackup?._id,
            contentLength: verifyBackup?.plaintextContent?.length,
            reportReason: verifyBackup?.reportReason
        });
        
        return {
            success: true,
            backupCreated: true,
            messageId: messageId,
            backupId: backup._id,
            contentLength: plaintextContent.length,
            reportersCount: backup.reportedBy.length,
            reportReason: backup.reportReason,
            verified: !!verifyBackup
        };
        
    } catch (error) {
        console.error('❌ [백업생성] 예외:', error);
        console.error('❌ [백업생성] 스택:', error.stack);
        
        return {
            success: false,
            error: error.message,
            messageId: messageId,
            stack: error.stack
        };
    }
};

/**
 * 관리자용 메시지 복호화 및 접근 로그 기록
 * @param {string} messageId - 메시지 ID 
 * @param {string} adminId - 관리자 ID
 * @param {string} purpose - 접근 목적
 * @param {string} ipAddress - IP 주소
 * @param {string} userAgent - User Agent
 * @returns {string} 복호화된 메시지 내용
 */
export const decryptMessageForAdmin = async (messageId, adminId, purpose, ipAddress, userAgent) => {
    try {
        console.log(`🔍 [관리자접근] 메시지 복호화 요청: ${messageId}`);
        
        // 1. 백업된 메시지 조회
        const backup = await ReportedMessageBackup.findOne({ 
            originalMessageId: messageId 
        });
        
        if (backup) {
            // 2. 접근 로그 기록
            backup.accessLog.push({
                accessedBy: adminId,
                purpose: purpose || 'admin_review',
                ipAddress: ipAddress,
                userAgent: userAgent
            });
            await backup.save();
            
            console.log('✅ [관리자접근] 백업에서 복호화된 내용 반환');
            return backup.plaintextContent;
        }
        
        // 3. 백업이 없으면 실시간 복호화
        const originalMessage = await ChatMessage.findById(messageId).lean();
        if (!originalMessage) {
            throw new Error('메시지를 찾을 수 없습니다');
        }
        
        if (originalMessage.isEncrypted && originalMessage.encryptedText) {
            const encryptedData = {
                method: 'KMS',
                version: '2.0',
                data: {
                    iv: originalMessage.iv,
                    data: originalMessage.encryptedText,
                    authTag: originalMessage.tag
                }
            };
            
            const decrypted = await ComprehensiveEncryption.decryptPersonalInfo(
                JSON.stringify(encryptedData)
            );
            
            console.log('✅ [관리자접근] 실시간 복호화 완료');
            return decrypted;
        }
        
        return originalMessage.text || '[메시지 내용 없음]';
        
    } catch (error) {
        console.error('❌ [관리자접근] 복호화 실패:', error.message);
        throw error;
    }
};

