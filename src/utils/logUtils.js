// src/utils/logUtils.js
import { AccessLog } from '../models/AccessLog.js';

/**
 * 🛡️ 스마트 액세스 로깅 (Smart Access Logging)
 * 
 * 목적:
 * 1. 법적 의무 준수 (IP 보관)
 * 2. DB 용량 최적화 (무의미한 새로고침/재접속 로그 방지)
 * 3. 보안 강화 (기기 변경 감지)
 * 
 * 로직:
 * - 마지막 로그와 비교하여 '변동 사항'이 있을 때만 저장합니다.
 * - 변동 사항 기준: IP 변경, 브라우저(기기) 변경, 1시간 경과
 * 
 * @param {string} userId - 유저 ObjectId
 * @param {string} currentIp - 현재 접속 IP (req.ip)
 * @param {string} action - 행동 유형 ('login', 'socket_connect', 'withdraw' 등)
 * @param {string} currentUserAgent - 브라우저 정보 (req.headers['user-agent'])
 */
export const checkAndLogAccess = async (
    userId, 
    currentIp, 
    action, 
    currentUserAgent,
    status = 'success' // ✅ status 파라미터 추가, 기본값 'success'
) => {
    try {
        let shouldSave = false;
        
        // [상황 0] 로그인 실패는 무조건 저장
        if (status === 'fail') {
            shouldSave = true;
        } else if (!userId) {
            // userId가 없으면 비교할 대상이 없으므로 저장하지 않음 (실패 로그가 아닌 경우)
            shouldSave = false;
        } else {
            // 1. 해당 유저의 가장 최신 로그 1개 조회 (Lean 쿼리로 가볍게)
            const lastLog = await AccessLog.findOne({ user: userId })
                .sort({ createdAt: -1 })
                .lean();

            if (!lastLog) {
                // [상황 1] 로그가 아예 없으면 무조건 저장 (첫 가입/첫 접속)
                shouldSave = true;
            } else {
                // [상황 2] IP가 바뀌었는가?
                const isIpChanged = lastLog.ip !== currentIp;
                
                // [상황 3] 기기/브라우저가 바뀌었는가?
                const isDeviceChanged = lastLog.userAgent !== currentUserAgent;

                // [상황 4] 마지막 기록 후 1시간이 지났는가?
                const timeDiff = Date.now() - new Date(lastLog.createdAt).getTime();
                const isTimeExpired = timeDiff > (1000 * 60 * 60); // 1시간

                // [상황 5] 반드시 기록해야 하는 중요한 행동인가?
                const isCriticalAction = ['login', 'logout', 'withdraw'].includes(action);

                if (isIpChanged || isDeviceChanged || isTimeExpired || isCriticalAction) {
                    shouldSave = true;
                }
            }
        }

        // 3. DB 저장 실행
        if (shouldSave) {
            const logEntry = {
                ip: currentIp,
                action: action,
                userAgent: currentUserAgent,
                status: status
            };
            
            // ✅ userId가 있을 때만 추가
            if (userId) {
                logEntry.user = userId;
            }

            await AccessLog.create(logEntry);
            console.log(`✅ [AccessLog] 저장: User=${userId || 'N/A'}, Action=${action}, Status=${status}, IP=${currentIp}`);
        } else {
            // console.log(`🚫 [AccessLog] 무시: User=${userId} (변동 없음)`);
        }

    } catch (error) {
        console.error('⚠️ [AccessLog] 저장 중 오류 발생 (무시됨):', error);
    }
};

/**
 * 유저의 최근 접속 기록 조회
 * @param {string} userId - 유저 ID
 * @param {number} limit - 가져올 개수 (기본 10개)
 * @returns {Promise<Array>} 접속 기록 배열
 */
export const getUserAccessLogs = async (userId, limit = 10) => {
    try {
        return await AccessLog.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
    } catch (error) {
        console.error('⚠️ [AccessLog] 조회 중 오류:', error);
        return [];
    }
};

/**
 * 특정 기간의 접속 기록 조회
 * @param {string} userId - 유저 ID
 * @param {Date} startDate - 시작 날짜
 * @param {Date} endDate - 종료 날짜
 * @returns {Promise<Array>} 접속 기록 배열
 */
export const getAccessLogsByDateRange = async (userId, startDate, endDate) => {
    try {
        return await AccessLog.find({
            user: userId,
            createdAt: {
                $gte: startDate,
                $lte: endDate
            }
        })
        .sort({ createdAt: -1 })
        .lean();
    } catch (error) {
        console.error('⚠️ [AccessLog] 기간별 조회 중 오류:', error);
        return [];
    }
};
