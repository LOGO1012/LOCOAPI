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

// 사용자가 읽으면 알림정보 db에서 삭제
export const markNotificationAsReadAndDelete = async (req, res) => {
    const { notificationId } = req.params;
    try {
        // 삭제 전 알림 존재 여부 확인 (선택사항)
        const notification = await ReportNotification.findById(notificationId);
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        // 알림을 DB에서 삭제
        await ReportNotification.findByIdAndDelete(notificationId);
        res.status(200).json({ success: true, message: 'Notification has been deleted after reading' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

