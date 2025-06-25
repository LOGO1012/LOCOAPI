import { Server } from 'socket.io';
import * as chatService from '../services/chatService.js';
import {ChatRoom, ChatRoomExit} from "../models/chat.js";
import * as userService from "../services/userService.js";
import mongoose from "mongoose";

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
        socket.on("sendMessage", async ({ chatRoom, sender, text }, callback) => {
            try {
                /* 0) sender 문자열·객체 대비, ObjectId 캐스팅 */
                const senderId    = typeof sender === "object" ? sender._id : sender;
                const senderObjId = new mongoose.Types.ObjectId(senderId);

                /* 1) 메시지 저장 */
                const message = await chatService.saveMessage(chatRoom, senderId, text);

                /* 2) 발신자 닉네임 조회 */
                const senderUser = await userService.getUserById(senderId);
                const senderNick = senderUser ? senderUser.nickname : "알 수 없음";

                /* 3) 프런트로 송신할 메시지 형태 */
                const messageWithNickname = {
                    ...message.toObject(),
                    sender: { id: senderId, nickname: senderNick }
                };

                /* 4) 방 내부 실시간 전송 */
                io.to(chatRoom).emit("receiveMessage", messageWithNickname);

                /* 5) 퇴장자·발신자 제외, 알림 대상 추출 */
                const roomDoc     = await ChatRoom.findById(chatRoom);
                const exitedUsers = await ChatRoomExit.distinct("user", { chatRoom });   // ObjectId 배열

                const targets = roomDoc.chatUsers.filter(uid =>
                    !uid.equals(senderObjId) &&                  // 발신자 제외
                    !exitedUsers.some(ex => ex.equals(uid))      // 퇴장자 제외
                );

                /* 6) 개인 알림 전송 */
                targets.forEach(uid => {
                    io.to(uid.toString()).emit("chatNotification", {
                        chatRoom,
                        roomType: roomDoc.roomType,
                        message:  messageWithNickname,
                        notification: `${senderNick}: ${text}`
                    });
                });

                /* 7) 클라이언트 콜백 */
                callback({ success: true, message: messageWithNickname });
            } catch (err) {
                console.error("❌ 메시지 처리 오류:", err);
                callback({ success: false, error: err.message });
            }
        });

        socket.on("deleteMessage", ({ messageId, roomId }) => {
            // 해당 방의 모든 클라이언트에게 삭제 이벤트 전송
            socket.to(roomId).emit("messageDeleted", { messageId });
        });

        socket.on("leaveRoom", async ({ roomId, userId }) => {
            /* 1) 방에서 소켓 제거 */
            socket.leave(roomId);

            /* 2) 참가자 리스트 갱신용 이벤트 */
            io.to(roomId).emit("userLeft", { userId });

            /* 3) 시스템-메시지 전송 */
            const user = await userService.getUserById(userId);
            const nickname = user ? user.nickname : "알 수 없음";

            io.to(roomId).emit("systemMessage", {
                _id: Date.now().toString(),          // 간단한 임시 ID
                sender: { _id: "system", nickname: "SYSTEM" },
                text: `${nickname} 님이 퇴장했습니다.`,
                textTime: new Date().toISOString(),
                isSystem: true
            });
        });

        // 클라이언트 연결 해제
        socket.on('disconnect', () => {
            console.log('❌ 클라이언트 연결 해제:', socket.id);
        });
    });

    return io;
};
