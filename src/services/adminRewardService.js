import { User } from '../models/UserProfile.js';
import ChatRewardLog from '../models/ChatRewardLog.js';
import ChatRewardItem from '../models/ChatRewardItem.js';

/**
 * 보상 대상 사용자 검색 서비스
 */
export const searchUsers = async ({ nickname, startDate, endDate, page, limit }) => {
    const query = { status: 'active' };
    if (nickname) query.nickname = { $regex: nickname, $options: 'i' };
    
    // 마지막 접속일 범위 검색 적용
    if (startDate || endDate) {
        query.lastLogin = {};
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            query.lastLogin.$gte = start;
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.lastLogin.$lte = end;
        }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find(query).select('nickname createdAt lastLogin numOfChat userLv').sort({ lastLogin: -1 }).skip(skip).limit(parseInt(limit)).lean();
    const total = await User.countDocuments(query);
    return { users, total };
};

/**
 * 보상 지급 서비스 (동일)
 */
export const giveReward = async ({ adminId, userIds, rewardAmount, reason, ipAddress, userAgent }) => {
    const amount = parseInt(rewardAmount);
    const masterLog = new ChatRewardLog({
        adminId,
        rewardAmount: amount,
        reason: reason || '관리자 보상',
        targetCount: userIds.length,
        ipAddress,
        userAgent
    });
    await masterLog.save();

    const items = userIds.map(userId => ({
        rewardLogId: masterLog._id,
        targetUserId: userId,
        status: 'active'
    }));

    await ChatRewardItem.insertMany(items);
    await Promise.all(userIds.map(async (userId) => {
        await User.findByIdAndUpdate(userId, { $inc: { numOfChat: amount } });
    }));

    return masterLog;
};

/**
 * 보상 내역 조회 서비스 (필터 강화 버전)
 */
export const getLogs = async ({ page, limit, adminNickname, startDate, endDate, reason }) => {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = {};

    // 1. 관리자 닉네임 검색
    if (adminNickname) {
        const admins = await User.find({ 
            nickname: { $regex: adminNickname, $options: 'i' },
            userLv: { $gte: 2 } 
        }).select('_id');
        const adminIds = admins.map(a => a._id);
        query.adminId = { $in: adminIds };
    }

    // 2. 지급 사유 검색
    if (reason) {
        query.reason = { $regex: reason, $options: 'i' };
    }

    // 3. 기간 검색 (시작일 ~ 종료일)
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            query.createdAt.$gte = start;
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.createdAt.$lte = end;
        }
    }

    const logs = await ChatRewardLog.find(query)
        .populate('adminId', 'nickname')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

    const logsWithPreview = await Promise.all(logs.map(async (log) => {
        const firstItem = await ChatRewardItem.findOne({ rewardLogId: log._id }).populate('targetUserId', 'nickname').lean();
        return {
            ...log,
            previewNickname: firstItem?.targetUserId?.nickname || '알 수 없음',
            hasCancelled: await ChatRewardItem.exists({ rewardLogId: log._id, status: 'cancelled' }),
            allCancelled: !(await ChatRewardItem.exists({ rewardLogId: log._id, status: 'active' }))
        };
    }));

    const total = await ChatRewardLog.countDocuments(query);
    return { logs: logsWithPreview, total };
};

/**
 * 상세 아이템 조회 (동일)
 */
export const getLogItems = async (logId) => {
    return await ChatRewardItem.find({ rewardLogId: logId }).populate('targetUserId', 'nickname').populate('cancelledBy', 'nickname').lean();
};

/**
 * 개별 보상 취소 (동일)
 */
export const cancelIndividualReward = async ({ itemId, adminId, reason }) => {
    const item = await ChatRewardItem.findById(itemId).populate('rewardLogId');
    if (!item) throw new Error('보상 기록 아이템을 찾을 수 없습니다.');
    if (item.status === 'cancelled') throw new Error('이미 취소된 보상입니다.');
    await User.findByIdAndUpdate(item.targetUserId, { $inc: { numOfChat: -item.rewardLogId.rewardAmount } });
    item.status = 'cancelled';
    item.cancelledAt = new Date();
    item.cancelledBy = adminId;
    item.cancelReason = reason || '관리자 취소';
    return await item.save();
};

/**
 * 그룹 보상 전체 취소 (동일)
 */
export const cancelAllRewardsInLog = async ({ logId, adminId, reason }) => {
    const items = await ChatRewardItem.find({ rewardLogId: logId, status: 'active' }).populate('rewardLogId');
    if (items.length === 0) throw new Error('취소할 수 있는 활성 보상이 없습니다.');
    const rewardAmount = items[0].rewardLogId.rewardAmount;
    await Promise.all(items.map(async (item) => {
        await User.findByIdAndUpdate(item.targetUserId, { $inc: { numOfChat: -rewardAmount } });
    }));
    await ChatRewardItem.updateMany(
        { rewardLogId: logId, status: 'active' },
        { status: 'cancelled', cancelledAt: new Date(), cancelledBy: adminId, cancelReason: reason || '관리자 전체 취소' }
    );
    return { cancelledCount: items.length };
};
