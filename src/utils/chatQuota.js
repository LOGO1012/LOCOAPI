// utils/chatQuota.js
const BASE = 30;                                    // 기본 허용
const BONUS = { basic: 10, standard: 20, premium: 30 };
export const REFILL_MS = 1 * 60 * 1000;        // 2 h → 7 200 000 ms

export const getMax = (planType = 'basic') =>
    BASE + (BONUS[planType] || 0);

/**
 * 2 h 단위로 numOfChat을 충전한다.
 * @param {Document} user Mongoose User 문서
 * @returns {Document} 갱신된 User 문서
 */
export const rechargeIfNeeded = async (user) => {
    const max = getMax(user.plan?.planType);          // 스키마: plan.planType[1]
    if (user.numOfChat >= max) return user;           // 이미 풀충전

    const last = user.chatTimer ?? new Date();        // 스키마: chatTimer[1]
    const now  = Date.now();
    const elapsed = now - new Date(last).getTime();
    const quota   = Math.floor(elapsed / REFILL_MS);  // 충전 횟수

    if (quota <= 0) return user;                      // 아직 2 h 지나지 않음

    user.numOfChat = Math.min(max, user.numOfChat + quota);
    const advanced = new Date(last.getTime() + quota * REFILL_MS);
    user.chatTimer = user.numOfChat >= max ? null : advanced;
    await user.save();
    return user;
};
