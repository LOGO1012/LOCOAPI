// src/services/historyService.js
import { NicknameHistory, GenderHistory } from '../models/UserHistories.js';

// 닉네임 변경 히스토리 저장
export const saveNicknameHistory = async (userId, oldNickname, newNickname, changeReason = 'user_change', changedBy, req = null) => {
    try {
        const historyData = {
            userId,
            oldNickname,
            newNickname,
            changeReason,
            changedBy,
            ipAddress: req?.ip || req?.connection?.remoteAddress || '',
            userAgent: req?.get('User-Agent') || ''
        };

        const nicknameHistory = new NicknameHistory(historyData);
        await nicknameHistory.save();

        console.log('닉네임 히스토리 저장 완료:', historyData);
        return nicknameHistory;
    } catch (error) {
        console.error('닉네임 히스토리 저장 실패:', error);
        throw error;
    }
};

// 성별 변경 히스토리 저장
export const saveGenderHistory = async (userId, oldGender, newGender, changeReason = 'user_change', changedBy, req = null) => {
    try {
        const historyData = {
            userId,
            oldGender,
            newGender,
            changeReason,
            changedBy,
            ipAddress: req?.ip || req?.connection?.remoteAddress || '',
            userAgent: req?.get('User-Agent') || ''
        };

        const genderHistory = new GenderHistory(historyData);
        await genderHistory.save();

        console.log('성별 히스토리 저장 완료:', historyData);
        return genderHistory;
    } catch (error) {
        console.error('성별 히스토리 저장 실패:', error);
        throw error;
    }
};

// 닉네임 히스토리 조회
export const getNicknameHistory = async (userId, limit = 50) => {
    try {
        const history = await NicknameHistory.find({ userId })
            .populate('changedBy', 'nickname name')
            .sort({ createdAt: -1 })
            .limit(limit);
        return history;
    } catch (error) {
        console.error('닉네임 히스토리 조회 실패:', error);
        throw error;
    }
};

// 성별 히스토리 조회
export const getGenderHistory = async (userId, limit = 50) => {
    try {
        const history = await GenderHistory.find({ userId })
            .populate('changedBy', 'nickname name')
            .sort({ createdAt: -1 })
            .limit(limit);
        return history;
    } catch (error) {
        console.error('성별 히스토리 조회 실패:', error);
        throw error;
    }
};

// 특정 기간 내 닉네임 변경 횟수 조회
export const getNicknameChangeCount = async (userId, days = 30) => {
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const count = await NicknameHistory.countDocuments({
            userId,
            changeReason: 'user_change',
            createdAt: { $gte: startDate }
        });

        return count;
    } catch (error) {
        console.error('닉네임 변경 횟수 조회 실패:', error);
        throw error;
    }
};

// 특정 기간 내 성별 변경 횟수 조회
export const getGenderChangeCount = async (userId, days = 30) => {
try {
const startDate = new Date();
startDate.setDate(startDate.getDate() - days);

const count = await GenderHistory.countDocuments({
userId,
changeReason: 'user_change',
createdAt: { $gte: startDate }
});

return count;
} catch (error) {
console.error('성별 변경 횟수 조회 실패:', error);
throw error;
}
};

// 오늘 닉네임 변경 횟수 조회
export const getTodayNicknameChangeCount = async (userId) => {
    try {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
        
        const count = await NicknameHistory.countDocuments({
            userId,
            changeReason: 'user_change',
            createdAt: { 
                $gte: startOfDay, 
                $lt: endOfDay 
            }
        });
        
        return count;
    } catch (error) {
        console.error('오늘 닉네임 변경 횟수 조회 실패:', error);
        throw error;
    }
};

// 오늘 성별 변경 횟수 조회
export const getTodayGenderChangeCount = async (userId) => {
    try {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
        
        const count = await GenderHistory.countDocuments({
            userId,
            changeReason: 'user_change',
            createdAt: { 
                $gte: startOfDay, 
                $lt: endOfDay 
            }
        });
        
        return count;
    } catch (error) {
        console.error('오늘 성별 변경 횟수 조회 실패:', error);
        throw error;
    }
};

// 마지막 닉네임 변경 시간 조회
export const getLastNicknameChangeTime = async (userId) => {
    try {
        const lastChange = await NicknameHistory.findOne({
            userId,
            changeReason: 'user_change'
        })
            .sort({ createdAt: -1 })
            .select('createdAt')  // ✅ 추가: 필요한 필드만 선택
            .lean();  // ✅ 추가: Mongoose 오버헤드 제거
        
        return lastChange ? lastChange.createdAt : null;
    } catch (error) {
        console.error('마지막 닉네임 변경 시간 조회 실패:', error);
        throw error;
    }
};

// 마지막 성별 변경 시간 조회
export const getLastGenderChangeTime = async (userId) => {
    try {
        const lastChange = await GenderHistory.findOne({
            userId,
            changeReason: 'user_change'
        })
            .sort({ createdAt: -1 })
            .select('createdAt')  // ✅ 추가: 필요한 필드만 선택
            .lean();  // ✅ 추가: Mongoose 오버헤드 제거
        
        return lastChange ? lastChange.createdAt : null;
    } catch (error) {
        console.error('마지막 성별 변경 시간 조회 실패:', error);
        throw error;
    }
};