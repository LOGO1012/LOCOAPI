import { Server } from 'socket.io';
import * as chatService from '../services/chatService.js';
import {ChatRoom, ChatRoomExit} from "../models/chat.js";
import * as userService from "../services/userService.js";
import * as onlineStatusService from '../services/onlineStatusService.js';
import mongoose from "mongoose";
import crypto from 'crypto';
import { filterProfanity } from '../utils/profanityFilter.js';

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
                    roomId: roomId,
                    roomType: roomType,
                    chatUsers: chatRoom.chatUsers,
                    activeUsers,
                    capacity: chatRoom.capacity,
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

        // 💬 메시지 전송 이벤트 - 동기 저장 방식 (안정적)
        socket.on("sendMessage", async ({ chatRoom, sender, text, roomType = 'random' }, callback) => {
            try {
                const senderId = typeof sender === "object" ? sender._id : sender;
                const senderObjId = new mongoose.Types.ObjectId(senderId);

                console.log(`📤 [메시지전송] 시작: "${text.substring(0, 20)}..." (방: ${chatRoom})`);

                // 1. 욕설 필터링 (실시간 표시용)
                const filteredText = filterProfanity(text);

                // 2. 발신자 정보 조회
                const senderUser = await userService.getUserById(senderId);
                const senderNick = senderUser ? senderUser.nickname : "알 수 없음";

                // 3. DB 저장 (원본 text 전달, saveMessage 내부에서 다시 필터링)
                const savedMessage = await chatService.saveMessage(chatRoom, senderId, text, {
                    platform: 'socket',
                    userAgent: 'realtime-chat',
                    ipHash: socket.handshake.address ?
                        crypto.createHash('sha256').update(socket.handshake.address).digest('hex').substring(0, 16) : null
                });

                console.log(`✅ [메시지저장] 완료: ${savedMessage._id} (${savedMessage.isEncrypted ? '암호화' : '평문'})`);

                // 4. 실제 저장된 메시지로 전송 데이터 구성
                const messageToSend = {
                    _id: savedMessage._id, // ✅ 실제 DB ID 사용
                    chatRoom,
                    sender: { _id: senderId, id: senderId, nickname: senderNick },
                    text: filteredText, // ✅ 필터링된 텍스트로 전송
                    textTime: savedMessage.textTime || new Date(),
                    isEncrypted: savedMessage.isEncrypted,
                    roomType: roomType,
                    readBy: savedMessage.readBy || [{ user: senderId, readAt: new Date() }],
                    isDeleted: false,
                    createdAt: savedMessage.createdAt
                };

                // 4. 모든 사용자에게 메시지 전송
                io.to(chatRoom).emit("receiveMessage", messageToSend);
                console.log(`📨 [메시지전송] 완료: ${savedMessage._id} → 방 ${chatRoom}`);

                // 5. 개인 알림 전송
                const roomDoc = await ChatRoom.findById(chatRoom);
                const exitedUsers = await ChatRoomExit.distinct("user", { chatRoom });
                const targets = roomDoc.chatUsers.filter(uid =>
                    !uid.equals(senderObjId) &&
                    !exitedUsers.some(ex => ex.equals(uid))
                );

                targets.forEach(uid => {
                    const notificationText = filteredText.length > 10 ? `${filteredText.substring(0, 10)}...` : filteredText;
                    io.to(uid.toString()).emit("chatNotification", {
                        chatRoom,
                        roomType: roomType,
                        message: messageToSend,
                        notification: `${senderNick}: ${notificationText}`,
                        timestamp: new Date()
                    });
                });

                // 6. 클라이언트에게 성공 응답
                callback({
                    success: true,
                    message: messageToSend,
                    encryptionEnabled: process.env.CHAT_ENCRYPTION_ENABLED === 'true'
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
        socket.on('leaveRoom', async ({ roomId, userId, roomType = 'random' }) => {
            socket.leave(roomId);

            try {
                const room = await ChatRoom.findById(roomId).select('status');
                const isWaiting = room?.status === 'waiting';

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
