// src/controllers/chatNotificationController.js
import * as svc from '../services/chatNotificationService.js';

/**
 * GET /api/chatNotification/:userId
 * - 해당 유저의 읽지 않은 알림들 반환
 */
export const getNotifications = async (req, res) => {
    try {
        const { userId } = req.params;
        const notifications = await svc.getUserNotifications(userId);
        res.status(200).json({ success: true, data: notifications });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * PUT /api/chatNotification/:id/read
 * - 특정 알림을 읽음 처리
 */
export const markRead = async (req, res) => {
    try {
        const { id } = req.params;
        await svc.deleteNotification(id);
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
