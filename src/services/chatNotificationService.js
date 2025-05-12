// src/services/chatNotificationService.js
import { ChatNotification } from '../models/chatNotification.js';

/**
 * 알림 생성
 */
export const createChatNotification = async ({ recipient, chatRoom, sender, roomType, message }) => {
    return await ChatNotification.create({ recipient, chatRoom, sender, roomType, message });
};

/**
 * 사용자의 읽지 않은 알림 조회
 */
export const getUserNotifications = async (userId) => {
    return await ChatNotification.find({ recipient: userId, isRead: false })
        .sort('-createdAt')
        .populate('sender', 'nickname')
        .populate('chatRoom', 'roomType');
};

/**
 * 알림 삭제 (읽음 처리 후 제거용)
 */
export const deleteNotification = async (notificationId) => {
    return await ChatNotification.findByIdAndDelete(notificationId);
};
