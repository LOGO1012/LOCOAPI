// src/routes/riotRoutes.js
// 라이엇 전적 조회 라우트

import express from 'express';
import { getRecord, refreshRecord } from '../controllers/riotController.js';

const router = express.Router();

/**
 * 전적 조회 (캐시 우선)
 * GET /api/riot/lol/:gameName/:tagLine
 *
 * 응답:
 * {
 *   success: true,
 *   data: {
 *     tier: "GOLD",
 *     rank: "IV",
 *     leaguePoints: 45,
 *     overallWinRate: 52.3,
 *     recentRanked: [...],
 *     lastUpdatedAt: "2025-02-09T12:00:00Z",
 *     fromCache: true,
 *     canRefresh: true,
 *     cooldownRemaining: 0
 *   }
 * }
 */
router.get('/lol/:gameName/:tagLine', getRecord);

/**
 * 전적 갱신 (새로고침)
 * POST /api/riot/lol/:gameName/:tagLine/refresh
 *
 * - 5분 쿨타임 적용
 * - 쿨타임 내 요청 시 429 응답
 *
 * 응답 (성공):
 * {
 *   success: true,
 *   data: {
 *     tier: "GOLD",
 *     rank: "IV",
 *     ...
 *     newMatchesCount: 2
 *   }
 * }
 *
 * 응답 (쿨타임):
 * {
 *   success: false,
 *   message: "180초 후 갱신 가능",
 *   data: { ... }
 * }
 */
router.post('/lol/:gameName/:tagLine/refresh', refreshRecord);

export default router;
