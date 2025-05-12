import { Server } from 'socket.io';
import * as chatService from '../services/chatService.js';
import { ChatRoom } from "../models/chat.js";
import * as userService from "../services/userService.js";
import {createChatNotification} from "../services/chatNotificationService.js";

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
        socket.on('joinRoom', async (roomId) => {
            socket.join(roomId);
            console.log(`📌 클라이언트 ${socket.id}가 방 ${roomId}에 참가`);

            try {
                const chatRoom = await ChatRoom.findById(roomId);
                if (!chatRoom) {
                    console.log("채팅방을 찾을 수 없습니다.");
                    return;
                }

                // 현재 채팅방의 인원 수와 최대 인원 수를 클라이언트에 전달
                io.to(roomId).emit('roomJoined', {
                    chatUsers: chatRoom.chatUsers,
                    capacity: chatRoom.capacity,
                });
            } catch (error) {
                console.error("채팅방 정보 가져오기 오류:", error);
            }
        });

        // 메시지 전송 이벤트
        socket.on('sendMessage', async ({ chatRoom, sender, text }, callback) => {
            try {
                const message = await chatService.saveMessage(chatRoom, sender, text);
                const senderUser = await userService.getUserById(sender);
                const senderNickname = senderUser ? senderUser.nickname : "알 수 없음";
                const messageWithNickname = { ...message.toObject(), sender: { id: sender, nickname: senderNickname } };

                // 1) 채팅방 사용자에게 실시간 전송
                io.to(chatRoom).emit('receiveMessage', messageWithNickname);

                // 2) 채팅 알림 저장·전송
                const room = await ChatRoom.findById(chatRoom);
                if (room) {
                    const userIds = room.chatUsers.map(u => u.toString());
                    for (const uid of userIds) {
                        if (uid === sender) continue;

                        // DB에 저장
                        const savedNotif = await createChatNotification({
                            recipient: uid,
                            chatRoom,
                            sender,
                            roomType: room.roomType,
                            message: `${senderNickname}: ${text}`
                        });

                        // 실시간 푸시도 함께
                        io.to(uid).emit('chatNotification', {
                            _id: savedNotif._id,
                            chatRoom,
                            roomType: room.roomType,
                            sender: { id: sender, nickname: senderNickname },
                            message: text
                        });
                    }
                }

                callback({ success: true, message: messageWithNickname });
            } catch (error) {
                console.error('❌ 메시지 저장 오류:', error);
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
