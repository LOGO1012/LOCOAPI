import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import redis from '../config/redis.js';  // ✅ 기존 Redis 클라이언트 재사용!
import * as chatService from '../services/chatService.js';
import {ChatRoom, ChatRoomExit} from "../models/chat.js";
import * as userService from "../services/userService.js";
import * as onlineStatusService from '../services/onlineStatusService.js';
import mongoose from "mongoose";
import crypto from 'crypto';
import { checkAndLogAccess } from '../utils/logUtils.js';
import IntelligentCache from "../utils/cache/intelligentCache.js";
import MessageBuffer from '../utils/messageBuffer.js';
import ChatEncryption from '../utils/encryption/chatEncryption.js';

export let io;

export const initializeSocket = async (server) => {
    io = new Server(server, { cors: { origin: '*' } });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🆕 Redis Adapter 설정 (기존 Redis 재사용)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try {
        // ✅ 기존 redis.js의 클라이언트를 재사용
        const pubClient = redis;
        const subClient = redis.duplicate();

        // subClient 연결
        await subClient.connect();

        console.log('✅ [Socket.IO] Redis Adapter 연결 성공');

        // Socket.IO에 Redis Adapter 적용
        io.adapter(createAdapter(pubClient, subClient));

        console.log('🔗 [Socket.IO] 서버 간 통신 활성화 (Cluster 모드)');

    } catch (error) {
        console.error('❌ [Socket.IO] Redis Adapter 연결 실패:', error);
        console.error('⚠️ [Socket.IO] 단일 서버 모드로 실행 (Cluster 불가)');
        // Redis 실패해도 서버는 정상 작동 (단일 서버 모드)
    }
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    io.on('connection', (socket) => {
        console.log('🔗 새로운 클라이언트 연결됨:', socket.id);

        const registeredUsers = new Set();

        socket.on('register', async (userId) => {
            if (!userId || typeof userId !== 'string' || userId.trim() === '') {
                console.warn('유효하지 않은 userId:', userId);
                socket.emit('registrationFailed', { error: '유효하지 않은 사용자 ID' });
                return;
            }

            if (registeredUsers.has(`${socket.id}-${userId}`)) return;
            registeredUsers.add(`${socket.id}-${userId}`);
            socket.join(userId);

            socket.userId = userId;

            // ✅ 🆕 추가: 소켓 연결 로그 기록
            const userIp = socket.request.headers['x-forwarded-for']
                || socket.request.connection.remoteAddress
                || socket.handshake.address;
            const userAgent = socket.request.headers['user-agent'] || 'unknown';

            checkAndLogAccess(
                userId,
                userIp,
                'socket_connect',
                userAgent
            ).catch(err => {
                console.error('소켓 로그 저장 실패 (무시):', err);
            });

            await onlineStatusService.setUserOnlineStatus(userId, socket.id, true);

            io.emit('userStatusChanged', {
                userId,
                isOnline: true,
                timestamp: new Date()
            });

            console.log(`사용자 ${userId} 등록됨 (socket: ${socket.id})`);
        });

        // ✅ 채팅방 참가 - roomType에 따라 구분 처리
        socket.on('joinRoom', async (roomId, roomType = 'random') => {
            socket.join(roomId);
            console.log(`📌 클라이언트 ${socket.id}가 방 ${roomId}에 참가 (타입: ${roomType})`);

            try {
                // ✅ 수정: 캐시 우회하여 최신 데이터 조회 (타이밍 문제 해결)
                const chatRoom = await ChatRoom.findById(roomId)
                    .populate('chatUsers', '_id nickname profilePhoto gender')
                    .lean();
                    
                if (!chatRoom) {
                    console.log("채팅방을 찾을 수 없습니다.");
                    return;
                }

                const exited = await ChatRoomExit.distinct('user', { chatRoom: roomId });
                
                // ✅ 수정: populate된 객체의 _id로 비교
                const exitedStrings = exited.map(id => id.toString());
                const activeUsers = chatRoom.chatUsers.filter(u => {
                    const odbjId = u._id ? u._id.toString() : u.toString();
                    return !exitedStrings.includes(odbjId);
                });
                
                console.log(`👥 [joinRoom] 방 ${roomId}: 전체 ${chatRoom.chatUsers.length}명, 활성 ${activeUsers.length}명, 정원 ${chatRoom.capacity}명`);

                const eventData = {
                    roomId: roomId,                    // ✅ 또는 roomId (단축)
                    roomType: roomType,                // ✅ 또는 roomType (단축)
                    chatUsers: chatRoom.chatUsers,     // ✅ 수정
                    activeUsers,                       // ✅ 이미 변수로 선언되어 있으므로 단축 가능
                    capacity: chatRoom.capacity,       // ✅ 수정
                    isActive: chatRoom.isActive,       // ✅ 추가
                    status: chatRoom.status            // ✅ 추가
                };

                if (roomType === 'friend') {
                    socket.emit('friendRoomJoined', eventData);
                } else if (roomType === 'random') {
                    io.to(roomId).emit('roomJoined', eventData);
                }

            } catch (error) {
                console.error("채팅방 정보 가져오기 오류:", error);
            }
        });

        // 메시지 읽음 처리 이벤트
        socket.on('markAsRead', async ({ roomId, userId }, callback) => {
            try {
                const result = await chatService.markMessagesAsRead(roomId, userId);
                socket.to(roomId).emit('messagesRead', {
                    roomId,
                    userId,
                    readCount: result.modifiedCount
                });
                callback({ success: true, readCount: result.modifiedCount });
            } catch (error) {
                console.error('메시지 읽음 처리 실패:', error);
                callback({ success: false, error: error.message });
            }
        });

        // 추가: 채팅방 입장 + 읽음 처리 통합
        socket.on('enterRoom', async ({ roomId, userId }, callback) => {
            try {
                console.log(`📥 [enterRoom] ${userId} → 방 ${roomId} 입장`);

                // 1. 입장 시간 기록
                // 2. 읽음 처리
                // 병렬 처리
                const [entryResult, readResult] = await Promise.all([
                    chatService.recordRoomEntry(roomId, userId),
                    chatService.markMessagesAsRead(roomId, userId)
                ]);
                // 3. Socket 방 참가
                socket.join(roomId);

                // 4. 안읽은 개수 리셋 알림 (배지 0으로 만들기)
                io.to(userId).emit("unreadCountUpdated", {
                    roomId: roomId,
                    reset: true,  // 리셋 플래그
                    unreadCount: 0,
                    timestamp: new Date()
                });

                // 5. 성공 응답
                callback({
                    success: true,
                    readCount: readResult.modifiedCount,
                    entryTime: entryResult.entryTime  // ✅ 입장 시간도 반환
                });

                console.log(`✅ [enterRoom] 완료: ${readResult.modifiedCount}개 읽음 (${entryResult.isUpdate ? '업데이트' : '생성'})`);

            } catch (error) {
                console.error('❌ [enterRoom] 실패:', error);

                // ✅ 상세 에러 로깅
                console.error('  - roomId:', roomId);
                console.error('  - userId:', userId);
                console.error('  - error:', error.message);
                console.error('  - stack:', error.stack);

                callback({
                    success: false,
                    error: error.message
                });
            }
        });


        // 🆕 Heartbeat: Ping 받으면 Pong 응답
        socket.on('ping', () => {
            socket.emit('pong');
        });


        // 💬 메시지 전송 이벤트 - 동기 저장 방식 (안정적)
        socket.on("sendMessage", async ({ chatRoom, sender, text, roomType = 'random' }, callback) => {
            try {
                const senderId = typeof sender === "object" ? sender._id : sender;
                const senderObjId = new mongoose.Types.ObjectId(senderId);

                console.log(`📤 [메시지전송] 시작: "${text.substring(0, 20)}..."`);

                // 1. 발신자 정보 조회 (wordFilterEnabled 포함)
                // Redis 캐싱 적용 (범용 메서드)
                let senderNick = await IntelligentCache.getUserNickname(senderId);

                if (!senderNick) {
                    const senderUser = await userService.getUserById(senderId);
                    senderNick = senderUser?.nickname || "알 수 없음";
                    await IntelligentCache.cacheUserNickname(senderId, senderNick);
                }


                
                // 2. DB 저장 (원본 text 전달)
                // const savedMessage = await chatService.saveMessage(chatRoom, senderId, text, {
                //     platform: 'socket',
                //     userAgent: 'realtime-chat',
                //     ipHash: socket.handshake.address ?
                //         crypto.createHash('sha256').update(socket.handshake.address).digest('hex').substring(0, 16) : null
                // });


                // ✅ 수정 2: 임시 ID 생성 (MongoDB _id와 동일한 형식)
                const tempId = new mongoose.Types.ObjectId();
                const now = new Date();
                const encryptionEnabled = process.env.CHAT_ENCRYPTION_ENABLED === 'true';


                // 수정 3: Redis 버퍼에 추가 (1-2ms)
                const messageData  = {
                    _id: tempId,  // 미리 생성한 ID 사용
                    chatRoom: chatRoom,
                    sender: senderId,
                    text: text,
                    textTime: now,
                    isEncrypted: false,
                    //roomType: roomType,
                    readBy: [{ user: senderId, readAt: now }],
                    //isDeleted: false, // 항상 false가 아니라 삭제 된 데이터만 필드 추가하면 됨
                    //createdAt: now,
                    //updatedAt: now
                };

                // ✅ 암호화 설정에 따라 필드 추가
                if (encryptionEnabled) {
                    console.log('🔐 [메시지전송] 암호화 모드');
                    const encrypted = ChatEncryption.encryptMessage(text);

                    messageData.isEncrypted = true;
                    messageData.encryptedText = encrypted.encryptedText;
                    messageData.iv = encrypted.iv;
                    messageData.tag = encrypted.tag;
                    // text 필드는 포함하지 않음 (암호화 모드)

                } else {
                    console.log('📝 [메시지전송] 평문 모드');

                    messageData.text = text;
                    messageData.isEncrypted = false;
                }

                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // 3️⃣ Redis 버퍼에 추가 (논블로킹)
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                MessageBuffer.addMessage(messageData).catch(err => {
                    console.error('❌ [버퍼] 추가 실패:', err);
                    // Fallback: 즉시 DB 저장 (비상)
                    chatService.saveMessage(chatRoom, senderId, text).catch(console.error);
                });

                console.log(`✅ [메시지버퍼] 추가: ${tempId} (${encryptionEnabled ? '암호화' : '평문'})`);

                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // 4️⃣ Socket 전송용 메시지 (클라이언트는 항상 평문)
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                const messageToSend = {
                    _id: tempId.toString(),
                    chatRoom,
                    sender: {
                        _id: senderId,
                        nickname: senderNick
                    },
                    text: text,  // ✅ 항상 평문 (클라이언트가 암호화 신경 쓸 필요 없음)
                    textTime: now,
                    isEncrypted: false,  // ✅ 클라이언트는 복호화된 상태로 받음
                    readBy: [{ user: senderId, readAt: now }]
                };


                // 4. 모든 사용자에게 메시지 전송
                io.to(chatRoom).emit("receiveMessage", messageToSend);
                console.log(`📨 [메시지전송] 완료: ${tempId} → 방 ${chatRoom}`);

                // 5. 개인 알림 전송 (원본 텍스트로 전송)
                const [roomDoc, exitedUsers] = await Promise.all([
                    ChatRoom.findById(chatRoom)
                        .select('chatUsers')
                        .lean(),  // ✅ Plain Object로 변환
                    ChatRoomExit.distinct("user", { chatRoom })
                ]);

                // ✅ String으로 변환 (lean 사용 시 필수!)
                const senderIdStr = senderObjId.toString();
                const exitedUsersStr = exitedUsers.map(id => id.toString());

                const targets = roomDoc.chatUsers.filter(uid =>{
                    const uidStr = uid.toString();
                    return uidStr !== senderIdStr && !exitedUsersStr.includes(uidStr);
                });

                targets.forEach(uid => {
                    const uidStr = uid.toString();

                    // 기존 채팅 알림
                    io.to(uidStr).emit("chatNotification", {
                        chatRoom,
                        roomType: roomType,
                        message: messageToSend,
                        notification: `${senderNick}: ${text}`,
                        timestamp: new Date()
                    });

                    // 🆕 안읽은 개수 실시간 푸시 (배지 업데이트용)
                    io.to(uidStr).emit("unreadCountUpdated", {
                        roomId: chatRoom,
                        roomType: roomType,
                        increment: 1,  // 메시지 1개 증가
                        timestamp: new Date()
                    });
                });

                // 6. 클라이언트에게 성공 응답
                callback({
                    success: true,
                    message: messageToSend,
                    encryptionEnabled: encryptionEnabled
                });

            } catch (err) {
                console.error("❌ [메시지전송] 오류:", err);
                callback({ success: false, error: err.message });
            }
        });


        socket.on("deleteMessage", ({ messageId, roomId }) => {
            socket.to(roomId).emit("messageDeleted", { messageId });
        });

        // ✅ 방 나가기 - roomType에 따라 구분 처리
        socket.on('leaveRoom', async ({ roomId, userId, roomType = 'random', status }) => {
            await socket.leave(roomId);

            try {
                // 클라이언트가 전달한 status 사용 (DB 조회 제거 → 즉시 emit)
                const isWaiting = status === 'waiting';

                if (isWaiting) {
                    if (roomType === 'friend') {
                        io.to(roomId).emit('friendWaitingLeft', { userId, roomId });
                    } else {
                        io.to(roomId).emit('waitingLeft', { userId, roomId });
                    }
                    return;
                }

                if (roomType === 'friend') {
                    io.to(roomId).emit('friendUserLeft', { userId, roomId });
                } else {
                    // userLeft 즉시 전송 (DB 조회 없이)
                    io.to(roomId).emit('userLeft', { userId, roomId });

                    // 닉네임: Redis 캐시 우선 조회 → 캐시 미스 시 DB 조회
                    let nickname = await IntelligentCache.getUserNickname(userId);
                    if (!nickname) {
                        const user = await userService.getUserById(userId);
                        nickname = user ? user.nickname : '알 수 없음';
                    }

                    const sysText = `${nickname} 님이 퇴장했습니다.`;
                    const tempId = new mongoose.Types.ObjectId();

                    // B에게 시스템 메시지 전송
                    io.to(roomId).emit('systemMessage', {
                        _id: tempId.toString(),
                        chatRoom: roomId,
                        text: sysText,
                        isSystem: true,
                        textTime: new Date(),
                        sender: { _id: 'system', nickname: 'SYSTEM' }
                    });

                    // DB 저장은 백그라운드로 처리
                    chatService.saveSystemMessage(roomId, sysText).catch(err => {
                        console.error('시스템 메시지 DB 저장 실패:', err);
                    });
                }
            } catch (error) {
                console.error('방 나가기 처리 오류:', error);
            }
        });

        socket.on('disconnect', async () => {
            console.log('❌ 클라이언트 연결 해제:', socket.id);

            const userId = socket.userId;


            if (userId) {
                await onlineStatusService.setUserOnlineStatus(userId, null, false);

                io.emit('userStatusChanged', {
                    userId,
                    isOnline: false,
                    timestamp: new Date()
                });
            }
        });
    });

    return io;
};


// ============================================================================
// 🆕 친구 관계 실시간 알림 헬퍼 함수
// ============================================================================

/**
 * 친구 추가 알림 전송
 * @param {string} userId - 친구 추가한 사용자 ID
 * @param {string} friendId - 추가된 친구 ID
 * @param userInfo
 * @param {Object} friendData - 친구 정보 ({ _id, nickname, profilePhoto, ... })
 */
export const emitFriendAdded = (userId, friendId, userInfo, friendData) => {
    if (!io) {
        console.warn('⚠️ Socket.IO가 초기화되지 않았습니다.');
        return;
    }

    // 친구 추가한 사람에게 알림
    io.to(userId).emit('friendAdded', {
        friend: friendData,
        timestamp: new Date()
    });

    // 추가된 친구에게도 알림
    io.to(friendId).emit('friendAdded', {
        friend: userInfo, // userId는 반대편 정보
        timestamp: new Date()
    });

    console.log(`👥 [Socket] 친구 추가 알림: ${userId} ↔ ${friendId}`);
};

/**
 * 친구 삭제 알림 전송
 * @param {string} userId - 친구 삭제한 사용자 ID
 * @param {string} friendId - 삭제된 친구 ID
 */
export const emitFriendDeleted = (userId, friendId) => {
    if (!io) {
        console.warn('⚠️ Socket.IO가 초기화되지 않았습니다.');
        return;
    }

    // 양쪽 모두에게 알림
    io.to(userId).emit('friendDeleted', {
        friendId: friendId,
        timestamp: new Date()
    });

    io.to(friendId).emit('friendDeleted', {
        friendId: userId,
        timestamp: new Date()
    });

    console.log(`🗑️ [Socket] 친구 삭제 알림: ${userId} ↔ ${friendId}`);
};

/**
 * 사용자 차단 알림 전송
 * @param {string} blockerId - 차단한 사용자 ID
 * @param {string} blockedId - 차단당한 사용자 ID
 */
export const emitFriendBlocked = (blockerId, blockedId) => {
    if (!io) {
        console.warn('⚠️ Socket.IO가 초기화되지 않았습니다.');
        return;
    }

    // 차단당한 사람에게만 알림 (차단한 사람은 이미 UI에서 처리)
    io.to(blockedId).emit('friendBlocked', {
        blockerId: blockerId,
        timestamp: new Date()
    });

    console.log(`🚫 [Socket] 차단 알림: ${blockerId} → ${blockedId}`);
};

/**
 * 차단 해제 알림 전송
 * @param {string} unblockerId - 차단 해제한 사용자 ID
 * @param {string} unblockedId - 차단 해제된 사용자 ID
 */
export const emitFriendUnblocked = (unblockerId, unblockedId) => {
    if (!io) {
        console.warn('⚠️ Socket.IO가 초기화되지 않았습니다.');
        return;
    }

    // 차단 해제된 사람에게 알림
    io.to(unblockedId).emit('friendUnblocked', {
        unblockerId: unblockerId,
        timestamp: new Date()
    });

    console.log(`✅ [Socket] 차단 해제 알림: ${unblockerId} → ${unblockedId}`);
};