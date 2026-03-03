import { ReportNotification } from '../models/ReportNotification.js';
import IntelligentCache from '../utils/cache/intelligentCache.js';

// 사용자의 미확인 알림 조회
export const getNotifications = async (req, res) => {
    const { userId } = req.params;

    // 본인 확인: 요청자와 대상 userId가 일치하는지 검증
    if (req.user._id.toString() !== userId) {
        return res.status(403).json({ success: false, message: '본인의 알림만 조회할 수 있습니다.' });
    }

    const cacheKey = `notifications:${userId}`;

    try {
        // 1. 캐시 확인
        const cachedNotifications = await IntelligentCache.getCache(cacheKey);
        if (cachedNotifications) {
            return res.status(200).json({ success: true, data: cachedNotifications });
        }

        // 2. 캐시 없으면 DB 조회
        const notifications = await ReportNotification.find({ receiver: userId, isRead: false })
            .select('_id content') // _id와 content 필드만 선택
            .sort({ createdAt: -1 });

        // 3. DB 결과를 캐시에 저장 (1분 TTL)
        await IntelligentCache.setCache(cacheKey, notifications, 60);

        res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 단일 알림 읽음 처리 (또는 여러 건 일괄 처리 가능)
export const markNotificationAsRead = async (req, res) => {
    const { notificationId } = req.params;
    try {
        const notification = await ReportNotification.findById(notificationId);
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        // 본인 확인
        const requestUserId = req.user._id.toString();
        if (notification.receiver.toString() !== requestUserId) {
            return res.status(403).json({ success: false, message: '본인의 알림만 처리할 수 있습니다.' });
        }
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
        // 0. 삭제 전 본인 확인
        const notification = await ReportNotification.findById(notificationId);
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        const requestUserId = req.user._id.toString();
        if (notification.receiver.toString() !== requestUserId) {
            return res.status(403).json({ success: false, message: '본인의 알림만 삭제할 수 있습니다.' });
        }

        // 1. 삭제 실행
        const deletedNotification = await ReportNotification.findByIdAndDelete(notificationId);

        // 2. 삭제된 알림이 없으면 404 반환
        if (!deletedNotification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        // 3. 캐시 무효화 실행
        const userId = deletedNotification.receiver;
        const cacheKey = `notifications:${userId}`;
        await IntelligentCache.deleteCache(cacheKey);

        res.status(200).json({ success: true, message: 'Notification has been deleted after reading' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

