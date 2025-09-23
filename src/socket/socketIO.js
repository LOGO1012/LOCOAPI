import { Server } from 'socket.io';
import * as chatService from '../services/chatService.js';
import {ChatRoom, ChatRoomExit} from "../models/chat.js";
import * as userService from "../services/userService.js";
import * as onlineStatusService from '../services/onlineStatusService.js';
import mongoose from "mongoose";
import crypto from 'crypto';

export let io;

export const initializeSocket = (server) => {
    io = new Server(server, { cors: { origin: '*' } });

    io.on('connection', (socket) => {
        console.log('🔗 새로운 클라이언트 연결됨:', socket.id);

        const registeredUsers = new Set();

        socket.on('register', (userId) => {
            if (!userId || typeof userId !== 'string' || userId.trim() === '') {
                console.warn('유효하지 않은 userId:', userId);
                socket.emit('registrationFailed', { error: '유효하지 않은 사용자 ID' });
                return;
            }

            if (registeredUsers.has(`${socket.id}-${userId}`)) return;
            registeredUsers.add(`${socket.id}-${userId}`);
            socket.join(userId);

            onlineStatusService.setUserOnlineStatus(userId, socket.id, true);
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
                const chatRoom = await ChatRoom.findById(roomId);
                if (!chatRoom) {
                    console.log("채팅방을 찾을 수 없습니다.");
                    return;
                }

                const exited = await ChatRoomExit.distinct('user', { chatRoom: roomId });
                const activeUsers = chatRoom.chatUsers.filter(u =>
                    !exited.some(id => id.equals(u))
                );

                const eventData = {
                    roomId: roomId, // ✅ roomId 포함
                    roomType: roomType, // ✅ roomType 포함
                    chatUsers: chatRoom.chatUsers,
                    activeUsers,
                    capacity: chatRoom.capacity,
                };

                // ✅ roomType에 따라 다른 이벤트 발송
                if (roomType === 'friend') {
                    // ChatOverlay (친구 채팅)용 - 개별 소켓에만 전송
                    socket.emit('friendRoomJoined', eventData);
                } else if (roomType === 'random') {
                    // ChatRoom (랜덤 채팅)용 - 방 전체에 전송
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

        // 💬 메시지 전송 이벤트 - 암호화 통합 버전
        socket.on("sendMessage", async ({ chatRoom, sender, text, roomType = 'random' }, callback) => {
            try {
                const senderId = typeof sender === "object" ? sender._id : sender;
                const senderObjId = new mongoose.Types.ObjectId(senderId);

                // 1. 실시간 전송용 데이터 (평문)
                const senderUser = await userService.getUserById(senderId);
                const senderNick = senderUser ? senderUser.nickname : "알 수 없음";

                const realtimeMessage = {
                    _id: new mongoose.Types.ObjectId(), // 임시 ID
                    chatRoom,
                    sender: { id: senderId, nickname: senderNick },
                    text: text, // 실시간은 평문 전송
                    textTime: new Date(),
                    isEncrypted: false,
                    roomType: roomType,
                    readBy: [{ user: senderId, readAt: new Date() }]
                };

                // 2. 실시간 전송 (빠른 응답)
                io.to(chatRoom).emit("receiveMessage", realtimeMessage);

                // 3. DB 저장은 비동기로 암호화 처리
                setImmediate(async () => {
                    try {
                        console.log(`🔐 [실시간채팅] 메시지 비동기 저장 시작: "${text.substring(0, 20)}..."`);

                        // 환경변수에 따라 암호화/평문 저장
                        const savedMessage = await chatService.saveMessage(chatRoom, senderId, text, {
                            platform: 'socket',
                            userAgent: 'realtime-chat',
                            ipHash: socket.handshake.address ?
                                crypto.createHash('sha256').update(socket.handshake.address).digest('hex').substring(0, 16) : null
                        });

                        console.log(`✅ [실시간채팅] DB 저장 완료: ${savedMessage._id} (${savedMessage.isEncrypted ? '암호화' : '평문'})`);

                        // 저장 완료 후 ID 업데이트 알림 (선택적)
                        io.to(chatRoom).emit("messageStored", {
                            tempId: realtimeMessage._id,
                            realId: savedMessage._id,
                            isEncrypted: savedMessage.isEncrypted,
                            storedAt: new Date()
                        });

                    } catch (saveError) {
                        console.error('❌ [실시간채팅] DB 저장 실패:', saveError);

                        // 저장 실패 알림
                        io.to(chatRoom).emit("messageStoreFailed", {
                            tempId: realtimeMessage._id,
                            error: saveError.message,
                            timestamp: new Date()
                        });
                    }
                });

                // 4. 개인 알림 전송 (기존 로직 유지)
                const roomDoc = await ChatRoom.findById(chatRoom);
                const exitedUsers = await ChatRoomExit.distinct("user", { chatRoom });
                const targets = roomDoc.chatUsers.filter(uid =>
                    !uid.equals(senderObjId) &&
                    !exitedUsers.some(ex => ex.equals(uid))
                );

                targets.forEach(uid => {
                    const notificationText = text.length > 10 ? `${text.substring(0, 10)}...` : text;
                    io.to(uid.toString()).emit("chatNotification", {
                        chatRoom,
                        roomType: roomType,
                        message: realtimeMessage,
                        notification: `${senderNick}: ${notificationText}`,
                        timestamp: new Date()
                    });
                });

                callback({
                    success: true,
                    message: realtimeMessage,
                    encryptionEnabled: process.env.CHAT_ENCRYPTION_ENABLED === 'true'
                });

            } catch (err) {
                console.error("❌ 메시지 처리 오류:", err);
                callback({ success: false, error: err.message });
            }
        });

        socket.on("deleteMessage", ({ messageId, roomId }) => {
            socket.to(roomId).emit("messageDeleted", { messageId });
        });

        // ✅ 방 나가기 - roomType에 따라 구분 처리
        socket.on('leaveRoom', async ({ roomId, userId, roomType = 'random' }) => {
            socket.leave(roomId);

            try {
                const room = await ChatRoom.findById(roomId).select('status');
                const isWaiting = room?.status === 'waiting';

                if (isWaiting) {
                    // ✅ roomType에 따라 다른 이벤트 발송
                    if (roomType === 'friend') {
                        io.to(roomId).emit('friendWaitingLeft', { userId, roomId });
                    } else {
                        io.to(roomId).emit('waitingLeft', { userId, roomId });
                    }
                    return;
                }

                // active 방일 때 처리
                if (roomType === 'friend') {
                    // 친구 채팅방 나가기 (시스템 메시지 없음)
                    io.to(roomId).emit('friendUserLeft', { userId, roomId });
                } else {
                    // 랜덤 채팅방 나가기 (시스템 메시지 포함)
                    io.to(roomId).emit('userLeft', { userId, roomId });

                    const user = await userService.getUserById(userId);
                    const nickname = user ? user.nickname : '알 수 없음';
                    const sysText = `${nickname} 님이 퇴장했습니다.`;
                    const saved = await chatService.saveSystemMessage(roomId, sysText);

                    io.to(roomId).emit('systemMessage', {
                        ...saved.toObject(),
                        sender: { _id: 'system', nickname: 'SYSTEM' }
                    });
                }
            } catch (error) {
                console.error('방 나가기 처리 오류:', error);
            }
        });

        // 클라이언트 연결 해제
        socket.on('disconnect', () => {
            console.log('❌ 클라이언트 연결 해제:', socket.id);

            const userId = onlineStatusService.findUserBySocketId(socket.id);
            if (userId) {
                onlineStatusService.setUserOnlineStatus(userId, null, false);
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
