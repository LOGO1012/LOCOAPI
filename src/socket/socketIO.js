import { Server } from 'socket.io';
import * as chatService from '../services/chatService.js';
import { ChatRoom } from "../models/chat.js";
import * as userService from "../services/userService.js";

export let io;

export const initializeSocket = (server) => {
    io = new Server(server, { cors: { origin: '*' } });

    io.on('connection', (socket) => {
        console.log('🔗 새로운 클라이언트 연결됨:', socket.id);

        // 사용자 등록: 클라이언트가 자신의 userId를 보내면 해당 userId 기반의 개인룸에 join합니다.
        socket.on('register', (userId) => {
            socket.join(userId);
            console.log(`사용자 ${userId} 등록됨`);
        });

        // 채팅방 참가
        socket.on('joinRoom', async ({ roomId, userId }) => {
            socket.join(roomId);
            console.log(`📌 ${userId}님이 방 ${roomId}에 참가`);

            try {
                const chatRoom = await ChatRoom.findById(roomId);
                if (!chatRoom) return;

                // 중복 방지 후 참가자 목록에 추가
                const exists = chatRoom.chatUsers
                    .map(u => u.toString())
                    .includes(userId);
                if (!exists) {
                    chatRoom.chatUsers.push(userId);
                    await chatRoom.save();
                }

                // 참가자 목록과 최대 수용 인원 함께 전송
                io.to(roomId).emit('roomJoined', {
                    chatUsers: chatRoom.chatUsers,
                    capacity: chatRoom.capacity,
                });
            } catch (err) {
                console.error('채팅방 참가 오류:', err);
            }
        });

        // 메시지 전송 이벤트
        socket.on('sendMessage', async ({ chatRoom, sender, text }, callback) => {
            // ... 메시지 저장, sender 정보 등 처리 ...
            try {
                // 메시지 저장 및 메시지 객체 생성 코드 (기존 코드 유지)
                const message = await chatService.saveMessage(chatRoom, sender, text);
                const senderUser = await userService.getUserById(sender);
                const senderNickname = senderUser ? senderUser.nickname : "알 수 없음";

                const messageWithNickname = {
                    ...message.toObject(),
                    sender: { id: sender, nickname: senderNickname }
                };

                // 채팅방 사용자에게 메시지 전송
                io.to(chatRoom).emit('receiveMessage', messageWithNickname);

                // 채팅 알림 전송: 알림에 roomType 추가
                const chatRoomObj = await ChatRoom.findById(chatRoom);
                if (chatRoomObj) {
                    const userIds = chatRoomObj.chatUsers.map(u => u.toString());
                    userIds.forEach(userId => {
                        if (userId !== sender) {
                            io.to(userId).emit('chatNotification', {
                                chatRoom,
                                roomType: chatRoomObj.roomType,  // roomType 정보 포함
                                message: messageWithNickname,
                                notification: `${senderNickname}: ${text}`
                            });
                        }
                    });
                }

                callback({ success: true, message: messageWithNickname });
            } catch (error) {
                console.error('❌ 메시지 저장 오류:', error.message);
                callback({ success: false, error: error.message });
            }
        });

        socket.on("deleteMessage", ({ messageId, roomId }) => {
            // 해당 방의 모든 클라이언트에게 삭제 이벤트 전송
            socket.to(roomId).emit("messageDeleted", { messageId });
        });

        socket.on("leaveRoom", async ({ roomId, userId }) => {
            const chatRoom = await ChatRoom.findById(roomId);
            if (!chatRoom) return;

            chatRoom.chatUsers = chatRoom.chatUsers.filter(user => user._id.toString() !== userId);

            if (chatRoom.chatUsers.length === 0) {
                chatRoom.isActive = false;
            }

            await chatRoom.save();

            // 모든 클라이언트에게 변경 사항 브로드캐스트
            io.to(roomId).emit("userLeft", { userId, chatUsers: chatRoom.chatUsers });
        });

        // 클라이언트 연결 해제
        socket.on('disconnect', () => {
            console.log('❌ 클라이언트 연결 해제:', socket.id);
        });
    });

    return io;
};
