// src/controllers/riotController.js
// 라이엇 전적 조회 컨트롤러

import * as riotService from '../services/riotService.js';

/**
 * 전적 조회 (캐시 우선)
 * GET /api/riot/lol/:gameName/:tagLine
 */
export async function getRecord(req, res) {
    try {
        const { gameName, tagLine } = req.params;

        console.log(`📊 [전적 조회] ${gameName}#${tagLine}`);

        const data = await riotService.getRecord(gameName, tagLine);

        return res.status(200).json({
            success: true,
            data
        });
    } catch (err) {
        console.error('❌ [전적 조회 실패]:', err.message);

        const status = getErrorStatus(err.message);

        return res.status(status).json({
            success: false,
            message: err.message
        });
    }
}

/**
 * 전적 갱신 (새로고침)
 * POST /api/riot/lol/:gameName/:tagLine/refresh
 */
export async function refreshRecord(req, res) {
    try {
        const { gameName, tagLine } = req.params;

        console.log(`🔄 [전적 갱신 요청] ${gameName}#${tagLine}`);

        const data = await riotService.refreshRecord(gameName, tagLine);

        // 쿨타임으로 갱신 불가 시
        if (data.canRefresh === false) {
            console.log(`⏳ [쿨타임 적용] ${data.cooldownRemaining}초 남음`);
            return res.status(429).json({
                success: false,
                message: `${data.cooldownRemaining}초 후 갱신 가능`,
                data
            });
        }

        console.log(`✅ [전적 갱신 완료] 새 매치: ${data.newMatchesCount}개`);

        return res.status(200).json({
            success: true,
            data
        });
    } catch (err) {
        console.error('❌ [전적 갱신 실패]:', err.message);

        const status = getErrorStatus(err.message);

        return res.status(status).json({
            success: false,
            message: err.message
        });
    }
}

/**
 * 에러 메시지에 따른 HTTP 상태 코드 반환
 */
function getErrorStatus(message) {
    if (/403/.test(message)) return 502;   // API 키 문제
    if (/404/.test(message)) return 404;   // Riot ID 없음
    if (/429/.test(message)) return 503;   // Rate Limit
    return 500;
}
