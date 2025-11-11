import { ReportNotification } from '../models/ReportNotification.js';
import IntelligentCache from '../utils/cache/intelligentCache.js';

// 사용자의 미확인 알림 조회
export const getNotifications = async (req, res) => {
    const { userId } = req.params;
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
        // 1. 삭제와 조회를 한번에 실행
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

