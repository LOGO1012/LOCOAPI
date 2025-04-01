import { Server } from 'socket.io';
import * as chatService from '../services/chatService.js';
import {ChatRoom} from "../models/chat.js";
import * as userService from "../services/userService.js";

export const initializeSocket = (server) => {
    const io = new Server(server, { cors: { origin: '*' } });

    io.on('connection', (socket) => {
        console.log('🔗 새로운 클라이언트 연결됨:', socket.id);

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
        socket.on('sendMessage', async ({chatRoom, sender, text}, callback) => {
            console.log('📨 메시지 전송 요청:', {chatRoom, sender, text});

            try {
                const senderUser = await userService.getUserById(sender);
                const senderNickname = senderUser ? senderUser.nickname : "알 수 없음";

                const message = await chatService.saveMessage(chatRoom, sender, text);
                console.log('💬 저장된 메시지:', message);

                // ✅ name을 포함한 메시지 객체 생성
                const messageWithNickname = {
                    ...message.toObject(),
                    sender: {id: sender, nickname: senderNickname}
                };

                // ✅ 중복 방지: 한 번만 emit
                io.to(chatRoom).emit('receiveMessage', messageWithNickname);
                console.log(`📤 방 ${chatRoom}에 메시지 전송됨`);

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
