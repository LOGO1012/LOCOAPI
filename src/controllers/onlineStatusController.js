import * as onlineStatusService from '../services/onlineStatusService.js';

/**
 * 여러 사용자의 온라인 상태 조회
 * POST /api/online-status/bulk
 */
export const getBulkOnlineStatus = async (req, res) => {
    try {
        const { userIds } = req.body;
        
        if (!Array.isArray(userIds)) {
            return res.status(400).json({
                success: false,
                message: 'userIds는 배열이어야 합니다.'
            });
        }
        
        const statusMap = onlineStatusService.getMultipleUserStatus(userIds);
        
        res.status(200).json({
            success: true,
            data: statusMap
        });
    } catch (error) {
        console.error('온라인 상태 조회 실패:', error);
        res.status(500).json({
            success: false,
            message: '온라인 상태 조회 실패',
            error: error.message
        });
    }
};

/**
 * 단일 사용자 온라인 상태 조회
 * GET /api/online-status/:userId
 */
export const getSingleOnlineStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const isOnline = onlineStatusService.getUserOnlineStatus(userId);
        
        res.status(200).json({
            success: true,
            data: {
                userId,
                isOnline,
                timestamp: new Date()
            }
        });
    } catch (error) {
        console.error('온라인 상태 조회 실패:', error);
        res.status(500).json({
            success: false,
            message: '온라인 상태 조회 실패',
            error: error.message
        });
    }
};

/**
 * 온라인 사용자 통계
 * GET /api/online-status/stats
 */
export const getOnlineStats = async (req, res) => {
    try {
        const stats = onlineStatusService.getOnlineStats();
        const onlineUsers = onlineStatusService.getAllOnlineUsers();
        
        res.status(200).json({
            success: true,
            data: {
                ...stats,
                onlineUserIds: onlineUsers
            }
        });
    } catch (error) {
        console.error('온라인 통계 조회 실패:', error);
        res.status(500).json({
            success: false,
            message: '온라인 통계 조회 실패',
            error: error.message
        });
    }
};
