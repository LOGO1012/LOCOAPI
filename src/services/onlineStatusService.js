/**
 * 사용자 온라인 상태 관리 서비스
 * 메모리 기반으로 빠른 조회와 업데이트를 지원
 */

// 온라인 사용자 상태 저장소 (메모리)
const onlineUsers = new Map(); // userId -> { socketId, lastSeen, isOnline }

/**
 * 사용자 온라인 상태 설정
 * @param {string} userId - 사용자 ID
 * @param {string} socketId - 소켓 ID
 * @param {boolean} isOnline - 온라인 여부
 */
export const setUserOnlineStatus = (userId, socketId, isOnline) => {
    if (!userId) {
        console.warn('setUserOnlineStatus: 유효하지 않은 userId:', userId);
        return;
    }
    if (isOnline) {
        onlineUsers.set(userId, {
            socketId,
            lastSeen: new Date(),
            isOnline: true
        });
        console.log(`🟢 사용자 온라인: ${userId} (${socketId})`);
    } else {
        onlineUsers.set(userId, {
            socketId: null,
            lastSeen: new Date(),
            isOnline: false
        });
        console.log(`🔴 사용자 오프라인: ${userId}`);
    }
};

/**
 * 사용자 온라인 상태 조회
 * @param {string} userId - 사용자 ID
 * @returns {boolean} 온라인 여부
 */
export const getUserOnlineStatus = (userId) => {
    const user = onlineUsers.get(userId);
    return user ? user.isOnline : false;
};

/**
 * 여러 사용자의 온라인 상태 조회
 * @param {string[]} userIds - 사용자 ID 배열
 * @returns {Object} userId -> isOnline 맵
 */
export const getMultipleUserStatus = (userIds) => {
    const statusMap = {};
    userIds.forEach(userId => {
        statusMap[userId] = getUserOnlineStatus(userId);
    });
    return statusMap;
};

/**
 * 모든 온라인 사용자 목록 조회
 * @returns {string[]} 온라인 사용자 ID 배열
 */
export const getAllOnlineUsers = () => {
    const onlineUserIds = [];
    onlineUsers.forEach((status, userId) => {
        if (status.isOnline) {
            onlineUserIds.push(userId);
        }
    });
    return onlineUserIds;
};

/**
 * 소켓 ID로 사용자 찾기
 * @param {string} socketId - 소켓 ID
 * @returns {string|null} 사용자 ID
 */
export const findUserBySocketId = (socketId) => {
    for (const [userId, status] of onlineUsers.entries()) {
        if (status.socketId === socketId) {
            return userId;
        }
    }
    return null;
};

/**
 * 온라인 상태 통계
 * @returns {Object} 통계 정보
 */
export const getOnlineStats = () => {
    let totalUsers = 0;
    let onlineCount = 0;
    
    onlineUsers.forEach((status) => {
        totalUsers++;
        if (status.isOnline) onlineCount++;
    });
    
    return {
        total: totalUsers,
        online: onlineCount,
        offline: totalUsers - onlineCount
    };
};
