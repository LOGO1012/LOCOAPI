// src/middlewares/adminAccessLogger.js
// 관리자 접근 로깅 전역 미들웨어 (안전성확보조치 기준 제8조 - 접속기록 2년 이상 보관)
import AdminAccessLog from '../models/adminAccessLog.js';

/**
 * 요청 경로 + HTTP 메서드 → action / targetType / purpose 자동 매핑
 */
const ROUTE_MAPPING = [
    // === adminRoutes (/api/admin) ===
    { path: /\/admin\/reported-statistics/, method: 'GET', action: 'user_statistics_access', targetType: 'Statistics', purpose: 'admin_management' },
    { path: /\/admin\/reported-messages\/([a-f0-9]{24})/, method: 'GET', action: 'report_review', targetType: 'ChatMessage', purpose: 'report_investigation', targetParam: 'messageId' },
    { path: /\/admin\/reported-messages/, method: 'GET', action: 'report_review', targetType: 'ChatMessage', purpose: 'report_investigation' },

    // === reportRoutes (/api) ===
    { path: /\/reports\/([a-f0-9]{24})\/context/, method: 'GET', action: 'context_investigation', targetType: 'Report', purpose: 'report_investigation', targetParam: 'id' },
    { path: /\/reports\/([a-f0-9]{24})\/decrypt/, method: 'POST', action: 'message_decryption', targetType: 'Report', purpose: 'report_investigation', targetParam: 'id' },
    { path: /\/reports\/([a-f0-9]{24})\/chat-log/, method: 'GET', action: 'context_investigation', targetType: 'Report', purpose: 'report_investigation', targetParam: 'id' },
    { path: /\/reports\/([a-f0-9]{24})\/plaintext\/all/, method: 'GET', action: 'message_decryption', targetType: 'Report', purpose: 'report_investigation', targetParam: 'id' },
    { path: /\/reports\/message\/([a-f0-9]{24})\/plaintext/, method: 'GET', action: 'message_decryption', targetType: 'ChatMessage', purpose: 'report_investigation', targetParam: 'messageId' },
    { path: /\/reports\/([a-f0-9]{24})\/reply/, method: 'POST', action: 'report_management', targetType: 'Report', purpose: 'report_investigation', targetParam: 'id' },
    { path: /\/reports\/([a-f0-9]{24})/, method: 'PUT', action: 'report_management', targetType: 'Report', purpose: 'report_investigation', targetParam: 'id' },
    { path: /\/reports\/([a-f0-9]{24})/, method: 'DELETE', action: 'report_management', targetType: 'Report', purpose: 'report_investigation', targetParam: 'id' },
    { path: /\/reports\/([a-f0-9]{24})/, method: 'GET', action: 'report_review', targetType: 'Report', purpose: 'report_investigation', targetParam: 'id' },
    { path: /\/reports/, method: 'GET', action: 'report_review', targetType: 'Report', purpose: 'report_investigation' },

    // === developerRoutes (/api/developer) ===
    { path: /\/developer\/decrypt-user-data/, method: 'POST', action: 'user_data_access', targetType: 'User', purpose: 'admin_management' },
    { path: /\/developer\/chat\/search/, method: 'GET', action: 'search_operation', targetType: 'ChatMessage', purpose: 'admin_management' },
    { path: /\/developer\/chat\/reported-context\/([a-f0-9]{24})/, method: 'GET', action: 'context_investigation', targetType: 'ChatMessage', purpose: 'report_investigation', targetParam: 'messageId' },
    { path: /\/developer\/chat\/reported-messages/, method: 'GET', action: 'report_review', targetType: 'ChatMessage', purpose: 'report_investigation' },
    { path: /\/developer\/chat\/status/, method: 'GET', action: 'admin_panel_access', targetType: 'Statistics', purpose: 'system_maintenance' },
    { path: /\/developer\/users\/([a-f0-9]{24})\/chat-history/, method: 'GET', action: 'user_data_access', targetType: 'User', purpose: 'admin_management', targetParam: 'userId' },
    { path: /\/developer\/users\/([a-f0-9]{24})\/block\/([a-f0-9]{24})\/minimal/, method: 'POST', action: 'user_block_management', targetType: 'User', purpose: 'admin_management', targetParam: 'targetUserId' },
    { path: /\/developer\/users\/([a-f0-9]{24})\/block\/([a-f0-9]{24})\/minimal/, method: 'DELETE', action: 'user_block_management', targetType: 'User', purpose: 'admin_management', targetParam: 'targetUserId' },
    { path: /\/developer\/users\/([a-f0-9]{24})\/blocked/, method: 'GET', action: 'user_data_access', targetType: 'User', purpose: 'admin_management', targetParam: 'userId' },
    { path: /\/developer\/users\/([a-f0-9]{24})/, method: 'PATCH', action: 'user_data_modification', targetType: 'User', purpose: 'admin_management', targetParam: 'userId' },
    { path: /\/developer\/users\/([a-f0-9]{24})/, method: 'GET', action: 'user_data_access', targetType: 'User', purpose: 'admin_management', targetParam: 'userId' },
    { path: /\/developer\/users/, method: 'GET', action: 'user_data_access', targetType: 'User', purpose: 'admin_management' },
    { path: /\/developer\/cache-status/, method: 'GET', action: 'admin_panel_access', targetType: 'Statistics', purpose: 'system_maintenance' },

    // === userRoutes - 관리자 전용 (requireLevel(3)) ===
    { path: /\/users\/user-count/, method: 'GET', action: 'user_statistics_access', targetType: 'Statistics', purpose: 'admin_management' },
    { path: /\/users\/gender-count/, method: 'GET', action: 'user_statistics_access', targetType: 'Statistics', purpose: 'admin_management' },
    { path: /\/users\/social-gender-count/, method: 'GET', action: 'user_statistics_access', targetType: 'Statistics', purpose: 'admin_management' },
    { path: /\/users\/([a-f0-9]{24})\/nickname-history/, method: 'GET', action: 'user_data_access', targetType: 'User', purpose: 'admin_management', targetParam: 'userId' },
    { path: /\/users\/([a-f0-9]{24})\/gender-history/, method: 'GET', action: 'user_data_access', targetType: 'User', purpose: 'admin_management', targetParam: 'userId' },
];

/**
 * 요청 경로에서 매핑 정보를 찾는다.
 */
function resolveMapping(req) {
    const url = req.originalUrl.split('?')[0]; // 쿼리스트링 제거
    const method = req.method;

    for (const mapping of ROUTE_MAPPING) {
        if (mapping.method === method && mapping.path.test(url)) {
            // targetId: req.params에서 추출, 없으면 regex 매치, 없으면 null
            let targetId = null;
            if (mapping.targetParam && req.params[mapping.targetParam]) {
                targetId = req.params[mapping.targetParam];
            } else if (mapping.targetParam) {
                // req.params에 없으면 regex에서 추출 시도
                const match = url.match(mapping.path);
                if (match && match[1]) {
                    targetId = match[1];
                }
            }
            // POST body에서 userId 추출 (decrypt-user-data 등)
            if (!targetId && req.body?.userId) {
                targetId = req.body.userId;
            }

            return {
                action: mapping.action,
                targetType: mapping.targetType,
                purpose: mapping.purpose,
                targetId
            };
        }
    }
    return null;
}

/**
 * 관리자 접근 로깅 미들웨어
 * res.on('finish') 훅으로 응답 완료 후 비동기 로깅 (요청 성능에 영향 없음)
 */
export default function adminAccessLogger(req, res, next) {
    // 관리자가 아니면 스킵
    if (!req.user || !req.user.userLv || req.user.userLv < 2) {
        return next();
    }

    res.on('finish', () => {
        const mapping = resolveMapping(req);
        if (!mapping) return; // 매핑 없으면 로깅 스킵 (테스트/디버그 엔드포인트 등)

        const logData = {
            adminId: req.user._id,
            adminNickname: req.user.nickname,
            adminLevel: req.user.userLv,
            action: mapping.action,
            targetType: mapping.targetType,
            targetId: mapping.targetId || undefined,
            purpose: mapping.purpose,
            ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
            userAgent: req.get('user-agent'),
            success: res.statusCode < 400,
            errorMessage: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : undefined,
            metadata: {
                searchKeyword: req.query?.keyword || undefined,
                exportedData: false
            }
        };

        // 비동기 저장 - 실패해도 요청에 영향 없음
        AdminAccessLog.logAccess(logData).catch(err => {
            console.error('관리자 접근 로그 저장 실패:', err.message);
        });
    });

    next();
}
