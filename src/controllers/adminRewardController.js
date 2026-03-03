import * as adminRewardService from '../services/adminRewardService.js';

/**
 * 사용자 검색 컨트롤러
 */
export const searchUsersForReward = async (req, res) => {
    try {
        const { nickname, startDate, endDate, page = 1, limit = 20 } = req.query;
        const { users, total } = await adminRewardService.searchUsers({ 
            nickname, 
            startDate,
            endDate, 
            page, 
            limit 
        });
        res.json({ success: true, users, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
    } catch (error) {
        console.error('❌ 사용자 검색 실패:', error);
        res.status(500).json({ success: false, message: '사용자 검색 중 오류가 발생했습니다.' });
    }
};

/**
 * 채팅 횟수 보상 지급 컨트롤러 (업데이트)
 */
export const giveChatReward = async (req, res) => {
    try {
        const { userIds, rewardAmount, reason } = req.body;
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) return res.status(400).json({ success: false, message: '대상 사용자를 선택해주세요.' });

        const rewardLog = await adminRewardService.giveReward({
            adminId: req.user._id,
            userIds,
            rewardAmount,
            reason,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent')
        });

        res.json({ success: true, message: `${userIds.length}명의 사용자에게 보상이 지급되었습니다.`, logId: rewardLog._id });
    } catch (error) {
        console.error('❌ 보상 지급 실패:', error);
        res.status(500).json({ success: false, message: error.message || '보상 지급 중 오류가 발생했습니다.' });
    }
};

/**
 * 보상 지급 내역 조회 컨트롤러 (마스터 목록)
 */
export const getRewardLogs = async (req, res) => {
    try {
        const { page = 1, limit = 20, adminNickname, startDate, endDate, reason } = req.query;
        const { logs, total } = await adminRewardService.getLogs({ 
            page, 
            limit,
            adminNickname,
            startDate,
            endDate,
            reason
        });
        res.json({ success: true, logs, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
    } catch (error) {
        console.error('❌ 보상 내역 조회 실패:', error);
        res.status(500).json({ success: false, message: '내역 조회 중 오류가 발생했습니다.' });
    }
};

/**
 * 특정 보상의 상세 아이템 조회 컨트롤러 (신규)
 */
export const getRewardLogItems = async (req, res) => {
    try {
        const { logId } = req.params;
        const items = await adminRewardService.getLogItems(logId);
        res.json({ success: true, items });
    } catch (error) {
        console.error('❌ 상세 아이템 조회 실패:', error);
        res.status(500).json({ success: false, message: '상세 내역을 불러오지 못했습니다.' });
    }
};

/**
 * 보상 지급 취소 컨트롤러 (아이템 기준 취소)
 */
export const cancelReward = async (req, res) => {
    try {
        const { itemId, reason } = req.body;
        if (!itemId) return res.status(400).json({ success: false, message: '기록 아이템 ID가 필요합니다.' });

        await adminRewardService.cancelIndividualReward({
            itemId,
            adminId: req.user._id,
            reason
        });

        res.json({ success: true, message: '보상이 성공적으로 취소되었습니다.' });
    } catch (error) {
        console.error('❌ 보상 취소 실패:', error);
        res.status(500).json({ success: false, message: error.message || '보상 취소 중 오류가 발생했습니다.' });
    }
};

/**
 * 그룹 보상 전체 취소 컨트롤러
 */
export const cancelAllRewards = async (req, res) => {
    try {
        const { logId, reason } = req.body;
        if (!logId) return res.status(400).json({ success: false, message: '기록 ID가 필요합니다.' });

        const result = await adminRewardService.cancelAllRewardsInLog({
            logId,
            adminId: req.user._id,
            reason
        });

        res.json({ success: true, message: `${result.cancelledCount}명의 보상이 모두 취소되었습니다.` });
    } catch (error) {
        console.error('❌ 전체 보상 취소 실패:', error);
        res.status(500).json({ success: false, message: error.message || '전체 보상 취소 중 오류가 발생했습니다.' });
    }
};
