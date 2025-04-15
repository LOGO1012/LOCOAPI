import { ReportNotification } from '../models/ReportNotification.js';

// 사용자의 미확인 알림 조회
export const getNotifications = async (req, res) => {
    const { userId } = req.params;
    try {
        const notifications = await ReportNotification.find({ receiver: userId, isRead: false }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 단일 알림 읽음 처리 (또는 여러 건 일괄 처리 가능)
export const markNotificationAsRead = async (req, res) => {
    const { notificationId } = req.params;
    try {
        await ReportNotification.findByIdAndUpdate(notificationId, { isRead: true });
        res.status(200).json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
