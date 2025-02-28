import { Server } from 'socket.io';
import * as chatService from '../services/chatService.js';
import {ChatRoom} from "../models/chat.js";

export const initializeSocket = (server) => {
    const io = new Server(server, { cors: { origin: '*' } });

    io.on('connection', (socket) => {
        console.log('🔗 새로운 클라이언트 연결됨:', socket.id);

        // 채팅방 참가
        socket.on('joinRoom', (roomId) => {
            socket.join(roomId);
            console.log(`📌 클라이언트 ${socket.id}가 방 ${roomId}에 참가`);
        });

        // 메시지 전송 이벤트
        socket.on('sendMessage', async ({ chatRoom, sender, text }, callback) => {
            try {
                const message = await chatService.saveMessage(chatRoom, sender, text);
                io.to(chatRoom).emit('receiveMessage', message); // 채팅방에 메시지 전송

                // 클라이언트에 응답
                callback({ success: true, message });
            } catch (error) {
                console.error('메시지 저장 오류:', error.message);
                callback({ success: false, error: error.message });
            }
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
