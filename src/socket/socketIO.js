import { Server } from 'socket.io';
import * as chatService from '../services/chatService.js';
import { ChatRoom } from "../models/chat.js";
import * as userService from "../services/userService.js";

export const initializeSocket = (server) => {
    const io = new Server(server, { cors: { origin: '*' } });

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
            console.log('📨 메시지 전송 요청:', { chatRoom, sender, text });

            try {
                const senderUser = await userService.getUserById(sender);
                const senderNickname = senderUser ? senderUser.nickname : "알 수 없음";

                const message = await chatService.saveMessage(chatRoom, sender, text);
                console.log('💬 저장된 메시지:', message);

                // 이름 포함 메시지 객체 생성
                const messageWithNickname = {
                    ...message.toObject(),
                    sender: { id: sender, nickname: senderNickname }
                };

                // 채팅방 사용자에게 메시지 전송
                io.to(chatRoom).emit('receiveMessage', messageWithNickname);
                console.log(`📤 방 ${chatRoom}에 메시지 전송됨`);

                // 실시간 채팅 알림: 채팅방의 모든 사용자에게 새 메시지 알림 전송 (보낸 사람 제외)
                const chatRoomObj = await ChatRoom.findById(chatRoom);
                if (chatRoomObj) {
                    const userIds = chatRoomObj.chatUsers.map(u => u.toString());
                    userIds.forEach(userId => {
                        if (userId !== sender) {
                            io.to(userId).emit('chatNotification', {
                                chatRoom,
                                message: messageWithNickname,
                                notification: `${senderNickname}님의 새로운 메시지`
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
