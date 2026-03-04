import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import redis from '../config/redis.js';
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
import jwt from 'jsonwebtoken';
import { getUserForAuth } from '../services/userService.js';
import { isBlacklisted } from '../utils/tokenBlacklist.js';

export let io;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 쿠키 파싱 유틸 (Socket.IO에는 cookie-parser 미적용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function parseCookies(cookieHeader) {
    const cookies = {};
    if (!cookieHeader) return cookies;
    cookieHeader.split(';').forEach(pair => {
        const [name, ...rest] = pair.trim().split('=');
        if (name) cookies[name.trim()] = decodeURIComponent(rest.join('='));
    });
    return cookies;
}

export const initializeSocket = async (server) => {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 서버 옵션 + CORS 화이트리스트
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    io = new Server(server, {
        cors: {
            origin: [
                process.env.FRONTEND_URL || "http://localhost:5173",
                process.env.FRONTEND_URL_ALT
            ].filter(Boolean),
            credentials: true
        },
        pingInterval: 25000,
        pingTimeout: 20000
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Redis Adapter 설정 (기존 Redis 재사용)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try {
        const pubClient = redis;
        const subClient = redis.duplicate();
        await subClient.connect();
        console.log('✅ [Socket.IO] Redis Adapter 연결 성공');
        io.adapter(createAdapter(pubClient, subClient));
        console.log('🔗 [Socket.IO] 서버 간 통신 활성화 (Cluster 모드)');
    } catch (error) {
        console.error('❌ [Socket.IO] Redis Adapter 연결 실패:', error);
        console.error('⚠️ [Socket.IO] 단일 서버 모드로 실행 (Cluster 불가)');
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 소켓 인증 미들웨어 (쿠키 기반 JWT 검증)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    io.use(async (socket, next) => {
        try {
            const cookies = parseCookies(socket.handshake.headers.cookie);
            const accessToken = cookies.accessToken;
            const refreshToken = cookies.refreshToken;

            // 1) accessToken 검증 시도
            if (accessToken) {
                try {
                    // 블랙리스트 체크
                    if (await isBlacklisted(accessToken)) throw new Error('blacklisted');
                    const payload = jwt.verify(accessToken, process.env.JWT_SECRET);
                    const user = await getUserForAuth(payload.userId);
                    if (user) {
                        socket.user = user;
                        return next();
                    }
                } catch {
                    // accessToken 만료/블랙리스트 → refreshToken으로 시도
                }
            }

            // 2) refreshToken 검증 시도
            if (refreshToken) {
                try {
                    // 블랙리스트 체크
                    if (await isBlacklisted(refreshToken)) throw new Error('blacklisted');
                    const payload = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
                    const user = await getUserForAuth(payload.userId);
                    if (user) {
                        socket.user = user;
                        return next();
                    }
                } catch {
                    // refreshToken도 실패/블랙리스트
                }
            }

            console.warn('⚠️ [Socket.IO] 인증 실패 - 토큰 없음 또는 유효하지 않음');
            return next(new Error('인증이 필요합니다.'));
        } catch (error) {
            console.error('❌ [Socket.IO] 인증 미들웨어 오류:', error.message);
            return next(new Error('인증 처리 중 오류가 발생했습니다.'));
        }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 소켓 이벤트 핸들러
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    io.on('connection', (socket) => {
        console.log('🔗 새로운 클라이언트 연결됨:', socket.id, `(user: ${socket.user?._id})`);

        const registeredUsers = new Set();

        // ━━━ register: 인증된 socket.user._id 사용 ━━━
        socket.on('register', async (clientUserId) => {
            try {
                // 인증 미들웨어에서 검증된 userId 사용 (클라이언트 값 무시)
                const userId = socket.user._id;

                if (registeredUsers.has(`${socket.id}-${userId}`)) return;
                registeredUsers.add(`${socket.id}-${userId}`);
                socket.join(userId);
                socket.userId = userId;

                // 소켓 연결 로그 기록
                const userIp = socket.request.headers['x-forwarded-for']
                    || socket.request.connection.remoteAddress
                    || socket.handshake.address;
                const userAgent = socket.request.headers['user-agent'] || 'unknown';

                checkAndLogAccess(userId, userIp, 'socket_connect', userAgent)
                    .catch(err => console.error('소켓 로그 저장 실패 (무시):', err));

                await onlineStatusService.setUserOnlineStatus(userId, socket.id, true);

                io.emit('userStatusChanged', {
                    userId,
                    isOnline: true,
                    timestamp: new Date()
                });

                console.log(`사용자 ${userId} 등록됨 (socket: ${socket.id})`);
            } catch (error) {
                console.error('❌ [register] 오류:', error.message);
                socket.emit('registrationFailed', { error: '등록 처리 중 오류가 발생했습니다.' });
            }
        });

        // ━━━ 채팅방 참가 ━━━
        socket.on('joinRoom', async (roomId, roomType = 'random') => {
            // H-04 보안 조치: 입력 검증
            if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
                console.warn(`⚠️ [H-04] joinRoom 잘못된 roomId: ${roomId}`);
                return;
            }
            if (!['random', 'friend'].includes(roomType)) {
                console.warn(`⚠️ [H-04] joinRoom 잘못된 roomType: ${roomType}`);
                return;
            }

            try {
                // H-11 보안 조치: socket.join 전에 멤버 검증 (기존 DB 조회를 앞으로 이동)
                const chatRoom = await ChatRoom.findById(roomId)
                    .populate('chatUsers', '_id nickname profilePhoto gender')
                    .lean();

                if (!chatRoom) {
                    console.log("채팅방을 찾을 수 없습니다.");
                    return;
                }

                const userId = socket.user._id.toString();
                const isMember = chatRoom.chatUsers.some(u => {
                    const uid = u._id ? u._id.toString() : u.toString();
                    return uid === userId;
                });

                if (!isMember) {
                    console.warn(`⚠️ [H-11] joinRoom 비멤버 접근 차단 - userId: ${userId}, roomId: ${roomId}`);
                    return;
                }

                // 멤버 검증 통과 후 참가
                socket.join(roomId);
                console.log(`📌 클라이언트 ${socket.id}가 방 ${roomId}에 참가 (타입: ${roomType})`);

                const exited = await ChatRoomExit.distinct('user', { chatRoom: roomId });

                const exitedStrings = exited.map(id => id.toString());
                const activeUsers = chatRoom.chatUsers.filter(u => {
                    const odbjId = u._id ? u._id.toString() : u.toString();
                    return !exitedStrings.includes(odbjId);
                });

                console.log(`👥 [joinRoom] 방 ${roomId}: 전체 ${chatRoom.chatUsers.length}명, 활성 ${activeUsers.length}명, 정원 ${chatRoom.capacity}명`);

                const eventData = {
                    roomId: roomId,
                    roomType: roomType,
                    chatUsers: chatRoom.chatUsers,
                    activeUsers,
                    capacity: chatRoom.capacity,
                    isActive: chatRoom.isActive,
                    status: chatRoom.status
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

        // ━━━ 메시지 읽음 처리 (Last-Read Pointer) ━━━
        socket.on('markAsRead', async ({ roomId }, callback) => {
            try {
                // H-04 보안 조치: roomId 검증
                if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
                    return callback({ success: false, error: '잘못된 채팅방 ID입니다.' });
                }

                const userId = socket.user._id;
                const result = await chatService.markMessagesAsRead(roomId, userId);

                // 상대방에게 "읽음" 상태 전송 (인스타 읽음 표시용)
                socket.to(roomId).emit('partnerRead', {
                    roomId,
                    userId: userId.toString(),
                    lastReadAt: result.lastReadAt
                });

                callback({ success: true });
            } catch (error) {
                console.error('메시지 읽음 처리 실패:', error);
                callback({ success: false, error: error.message });
            }
        });

        // ━━━ 채팅방 입장 + 읽음 처리 통합 (Last-Read Pointer) ━━━
        socket.on('enterRoom', async ({ roomId }, callback) => {
            try {
                // H-04 보안 조치: roomId 검증
                if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
                    return callback({ success: false, error: '잘못된 채팅방 ID입니다.' });
                }

                const userId = socket.user._id;

                // H-11 보안 조치: 멤버 검증
                const room = await ChatRoom.findById(roomId).select('chatUsers').lean();
                if (!room) {
                    return callback({ success: false, error: '채팅방을 찾을 수 없습니다.' });
                }
                const isMember = room.chatUsers.some(u => u.toString() === userId.toString());
                if (!isMember) {
                    console.warn(`⚠️ [H-11] enterRoom 비멤버 접근 차단 - userId: ${userId}, roomId: ${roomId}`);
                    return callback({ success: false, error: '접근 권한이 없습니다.' });
                }

                // 1. lastReadAt 갱신 (읽음 처리 + 입장 기록 통합)
                const result = await chatService.markMessagesAsRead(roomId, userId);

                // 2. 소켓 룸 참가 (멤버 검증 통과 후)
                socket.join(roomId);

                // 3. 본인에게 안읽은 개수 리셋
                io.to(userId.toString()).emit("unreadCountUpdated", {
                    roomId,
                    reset: true,
                    unreadCount: 0,
                    timestamp: new Date()
                });

                // 4. 상대방에게 "읽음" 상태 전송
                socket.to(roomId).emit('partnerRead', {
                    roomId,
                    userId: userId.toString(),
                    lastReadAt: result.lastReadAt
                });

                // 5. 상대방의 lastReadAt 조회 (클라이언트에서 "읽음" 표시용)
                const partnerLastReadAt = await chatService.getPartnerLastReadAt(roomId, userId);

                callback({
                    success: true,
                    lastReadAt: result.lastReadAt,
                    partnerLastReadAt
                });

            } catch (error) {
                console.error('❌ [enterRoom] 실패:', error);
                callback({ success: false, error: error.message });
            }
        });

        // ━━━ Heartbeat ━━━
        socket.on('ping', () => {
            socket.emit('pong');
        });

        // ━━━ 메시지 전송 ━━━
        socket.on("sendMessage", async ({ chatRoom, sender, text, roomType = 'random' }, callback) => {
            try {
                // H-04 보안 조치: 입력 검증
                if (!chatRoom || !mongoose.Types.ObjectId.isValid(chatRoom)) {
                    return callback({ success: false, error: '잘못된 채팅방 ID입니다.' });
                }
                if (!text || typeof text !== 'string' || !text.trim()) {
                    return callback({ success: false, error: '메시지 내용이 비어있습니다.' });
                }
                if (text.length > 100) {
                    return callback({ success: false, error: '메시지가 너무 깁니다. (최대 100자)' });
                }
                if (!['random', 'friend'].includes(roomType)) {
                    return callback({ success: false, error: '잘못된 채팅 유형입니다.' });
                }

                // H-12 보안 조치: 클라이언트 sender 무시, 인증된 socket.user._id 사용
                const senderId = socket.user._id.toString();
                const senderObjId = new mongoose.Types.ObjectId(senderId);

                console.log(`📤 [메시지전송] 시작: "${text.substring(0, 20)}..." (roomType: ${roomType})`);

                // 친구 채팅인 경우 친구 관계 검증
                if (roomType === 'friend') {
                    const room = await ChatRoom.findById(chatRoom).select('chatUsers').lean();
                    if (!room) {
                        console.log(`❌ [메시지전송] 채팅방 없음: ${chatRoom}`);
                        callback({ success: false, error: '채팅방을 찾을 수 없습니다.' });
                        return;
                    }

                    const otherUserId = room.chatUsers.find(u => u.toString() !== senderId);
                    if (!otherUserId) {
                        console.log(`❌ [메시지전송] 상대방 없음`);
                        callback({ success: false, error: '상대방을 찾을 수 없습니다.' });
                        return;
                    }

                    // 경량 친구 관계 확인 (DB에서 직접 확인)
                    const isFriend = await userService.checkIsFriend(senderId, otherUserId);

                    if (!isFriend) {
                        console.log(`🚫 [메시지전송] 친구 아님: ${senderId} → ${otherUserId}`);
                        callback({ success: false, error: '친구가 아닌 사용자에게 메시지를 보낼 수 없습니다.' });
                        return;
                    }

                    console.log(`✅ [메시지전송] 친구 관계 확인 완료`);
                }

                // 발신자 닉네임 조회 (캐싱)
                let senderNick = await IntelligentCache.getUserNickname(senderId);

                if (!senderNick) {
                    const senderUser = await userService.getUserById(senderId);
                    senderNick = senderUser?.nickname || "알 수 없음";
                    await IntelligentCache.cacheUserNickname(senderId, senderNick);
                }

                const tempId = new mongoose.Types.ObjectId();
                const now = new Date();
                const encryptionEnabled = process.env.CHAT_ENCRYPTION_ENABLED === 'true';

                const messageData  = {
                    _id: tempId,
                    chatRoom: chatRoom,
                    sender: senderId,
                    isEncrypted: false,
                };

                if (encryptionEnabled) {
                    console.log('🔐 [메시지전송] 암호화 모드');
                    const encrypted = ChatEncryption.encryptMessage(text);

                    messageData.isEncrypted = true;
                    messageData.encryptedText = encrypted.encryptedText;
                    messageData.iv = encrypted.iv;
                    messageData.tag = encrypted.tag;
                } else {
                    console.log('📝 [메시지전송] 평문 모드');
                    messageData.text = text;
                    messageData.isEncrypted = false;
                }

                // ━━━ Redis 버퍼에 추가 (논블로킹) + fallback 강화 ━━━
                MessageBuffer.addMessage(messageData).catch(async (err) => {
                    console.error('❌ [버퍼] 추가 실패:', err);
                    try {
                        await chatService.saveMessage(chatRoom, senderId, text);
                        console.log('✅ [버퍼 fallback] DB 직접 저장 성공');
                    } catch (dbErr) {
                        console.error('❌ [버퍼 fallback] DB 저장도 실패 - 메시지 유실 위험:', dbErr.message);
                    }
                });

                console.log(`✅ [메시지버퍼] 추가: ${tempId} (${encryptionEnabled ? '암호화' : '평문'})`);

                // Socket 전송용 메시지 (클라이언트는 항상 평문)
                const messageToSend = {
                    _id: tempId.toString(),
                    chatRoom,
                    sender: {
                        _id: senderId,
                        nickname: senderNick
                    },
                    text: text,
                    createdAt: now,
                    isEncrypted: false,
                };

                // 모든 사용자에게 메시지 전송
                io.to(chatRoom).emit("receiveMessage", messageToSend);
                console.log(`📨 [메시지전송] 완료: ${tempId} → 방 ${chatRoom}`);

                // 개인 알림 전송
                const [roomDoc, exitedUsers] = await Promise.all([
                    ChatRoom.findById(chatRoom)
                        .select('chatUsers')
                        .lean(),
                    ChatRoomExit.distinct("user", { chatRoom })
                ]);

                const senderIdStr = senderObjId.toString();
                const exitedUsersStr = exitedUsers.map(id => id.toString());

                const targets = roomDoc.chatUsers.filter(uid =>{
                    const uidStr = uid.toString();
                    return uidStr !== senderIdStr && !exitedUsersStr.includes(uidStr);
                });

                targets.forEach(uid => {
                    const uidStr = uid.toString();

                    io.to(uidStr).emit("chatNotification", {
                        chatRoom,
                        roomType: roomType,
                        message: messageToSend,
                        notification: `${senderNick}: ${text}`,
                        timestamp: new Date()
                    });

                    io.to(uidStr).emit("unreadCountUpdated", {
                        roomId: chatRoom,
                        roomType: roomType,
                        increment: 1,
                        timestamp: new Date()
                    });
                });

                // 클라이언트에게 성공 응답
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
            // H-04 보안 조치: 입력 검증
            if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) return;
            if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) return;

            socket.to(roomId).emit("messageDeleted", { messageId });
        });

        // ━━━ 방 나가기 (socket.leave를 try 안으로 이동) ━━━
        socket.on('leaveRoom', async ({ roomId, userId: _clientUserId, roomType = 'random', status }) => {
            try {
                // H-04 보안 조치: 입력 검증
                if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
                    console.warn(`⚠️ [H-04] leaveRoom 잘못된 roomId: ${roomId}`);
                    return;
                }
                if (!['random', 'friend'].includes(roomType)) return;
                if (status && !['waiting', 'active'].includes(status)) return;

                // H-12 보안 조치: 클라이언트 userId 무시, 인증된 socket.user._id 사용
                const userId = socket.user._id.toString();
                await socket.leave(roomId);

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
                    io.to(roomId).emit('userLeft', { userId, roomId });

                    let nickname = await IntelligentCache.getUserNickname(userId);
                    if (!nickname) {
                        const user = await userService.getUserById(userId);
                        nickname = user ? user.nickname : '알 수 없음';
                    }

                    const sysText = `${nickname} 님이 퇴장했습니다.`;
                    const tempId = new mongoose.Types.ObjectId();

                    io.to(roomId).emit('systemMessage', {
                        _id: tempId.toString(),
                        chatRoom: roomId,
                        text: sysText,
                        isSystem: true,
                        createdAt: new Date(),
                        sender: { _id: 'system', nickname: 'SYSTEM' }
                    });

                    chatService.saveSystemMessage(roomId, sysText).catch(err => {
                        console.error('시스템 메시지 DB 저장 실패:', err);
                    });
                }
            } catch (error) {
                console.error('방 나가기 처리 오류:', error);
            }
        });

        // ━━━ disconnect: try-catch 추가 ━━━
        socket.on('disconnect', async () => {
            console.log('❌ 클라이언트 연결 해제:', socket.id);

            const userId = socket.userId;

            if (userId) {
                try {
                    await onlineStatusService.setUserOnlineStatus(userId, null, false);

                    io.emit('userStatusChanged', {
                        userId,
                        isOnline: false,
                        timestamp: new Date()
                    });
                } catch (error) {
                    console.error('❌ [disconnect] 오프라인 상태 업데이트 실패:', error.message);
                }
            }
        });
    });

    return io;
};


// ============================================================================
// 친구 관계 실시간 알림 헬퍼 함수
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

    io.to(userId).emit('friendAdded', {
        friend: friendData,
        timestamp: new Date()
    });

    io.to(friendId).emit('friendAdded', {
        friend: userInfo,
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

    io.to(unblockedId).emit('friendUnblocked', {
        unblockerId: unblockerId,
        timestamp: new Date()
    });

    console.log(`✅ [Socket] 차단 해제 알림: ${unblockerId} → ${unblockedId}`);
};
