// src/services/riotService.js
// 라이엇 전적 조회 서비스 (DB 캐싱 + 증분 갱신)

import { LoLRecord } from '../models/riot.js';
import * as riotApi from '../utils/riotApiClient.js';

// 갱신 쿨타임: 5분
const REFRESH_COOLDOWN = 5 * 60 * 1000;

/**
 * 전적 조회 (DB 캐시 우선)
 * @param {string} gameName - 게임 닉네임
 * @param {string} tagLine - 태그라인
 * @returns {Promise<Object>} 전적 데이터
 */
export async function getRecord(gameName, tagLine) {
    // 1. DB 캐시 확인
    const cached = await LoLRecord.findOne({ gameName, tagLine }).lean();

    if (cached) {
        console.log(`💾 [캐시 HIT] ${gameName}#${tagLine}`);
        return {
            ...formatResponse(cached),
            fromCache: true,
            canRefresh: canRefresh(cached.lastUpdatedAt),
            cooldownRemaining: getCooldownRemaining(cached.lastUpdatedAt)
        };
    }

    // 2. 캐시 없으면 신규 조회
    console.log(`🔍 [캐시 MISS] ${gameName}#${tagLine} → API 호출`);
    return await fetchAndSave(gameName, tagLine);
}

/**
 * 전적 갱신 (새로고침)
 * @param {string} gameName - 게임 닉네임
 * @param {string} tagLine - 태그라인
 * @returns {Promise<Object>} 갱신된 전적 데이터
 */
export async function refreshRecord(gameName, tagLine) {
    const cached = await LoLRecord.findOne({ gameName, tagLine });

    // 쿨타임 체크
    if (cached && !canRefresh(cached.lastUpdatedAt)) {
        console.log(`⏳ [쿨타임] ${gameName}#${tagLine} - ${getCooldownRemaining(cached.lastUpdatedAt)}초 남음`);
        return {
            ...formatResponse(cached),
            fromCache: true,
            canRefresh: false,
            cooldownRemaining: getCooldownRemaining(cached.lastUpdatedAt),
            message: '5분 내 갱신 불가'
        };
    }

    // 증분 갱신 (기존 데이터 있으면)
    if (cached) {
        console.log(`🔄 [증분 갱신] ${gameName}#${tagLine}`);
        return await incrementalRefresh(cached);
    }

    // 신규 조회
    console.log(`🆕 [신규 조회] ${gameName}#${tagLine}`);
    return await fetchAndSave(gameName, tagLine);
}

/**
 * 신규 데이터 조회 및 저장
 */
async function fetchAndSave(gameName, tagLine) {
    // 1. PUUID 조회
    const puuid = await riotApi.getPuuidByRiotId(gameName, tagLine);

    // 2. 병렬 조회: 리그 정보 + 매치 목록 + 버전
    const [leagueData, matchIds, version] = await Promise.all([
        riotApi.getLeagueData(puuid),
        riotApi.getMatchIds(puuid, 10),
        riotApi.getLatestVersion()
    ]);

    // 3. 매치 상세 조회 (배치)
    const matches = await fetchMatchDetails(matchIds, puuid, version);

    // 4. DB 저장 (upsert)
    const record = await LoLRecord.findOneAndUpdate(
        { gameName, tagLine },
        {
            gameName,
            tagLine,
            puuid,
            tier: leagueData.tier,
            rank: leagueData.rank,
            leaguePoints: leagueData.leaguePoints,
            overallWinRate: leagueData.overallWinRate,
            matches: matches.slice(0, 10),
            lastUpdatedAt: new Date()
        },
        { upsert: true, new: true }
    );

    console.log(`✅ [저장 완료] ${gameName}#${tagLine} - ${matches.length}개 매치`);

    return {
        ...formatResponse(record),
        fromCache: false,
        canRefresh: true,
        cooldownRemaining: 0,
        newMatchesCount: matches.length
    };
}

/**
 * 증분 갱신 (새 매치만 조회)
 */
async function incrementalRefresh(cached) {
    const existingMatchIds = new Set(cached.matches.map(m => m.matchId));

    // 1. 최신 매치 ID 조회
    const latestMatchIds = await riotApi.getMatchIds(cached.puuid, 10);

    // 2. 새 매치 필터링
    const newMatchIds = latestMatchIds.filter(id => !existingMatchIds.has(id));

    // 3. 리그 정보 업데이트
    const leagueData = await riotApi.getLeagueData(cached.puuid);
    cached.tier = leagueData.tier;
    cached.rank = leagueData.rank;
    cached.leaguePoints = leagueData.leaguePoints;
    cached.overallWinRate = leagueData.overallWinRate;

    // 4. 새 매치가 있으면 상세 조회
    let newMatchesCount = 0;
    if (newMatchIds.length > 0) {
        const version = await riotApi.getLatestVersion();
        const newMatches = await fetchMatchDetails(newMatchIds, cached.puuid, version);

        // 기존 + 신규 병합 후 최신 10개만 유지
        const allMatches = [...newMatches, ...cached.matches]
            .sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt))
            .slice(0, 10);

        cached.matches = allMatches;
        newMatchesCount = newMatches.length;

        console.log(`📥 [새 매치] ${newMatchesCount}개 추가`);
    } else {
        console.log(`📭 [새 매치 없음] 랭크 정보만 업데이트`);
    }

    cached.lastUpdatedAt = new Date();
    await cached.save();

    return {
        ...formatResponse(cached),
        fromCache: false,
        canRefresh: true,
        cooldownRemaining: 0,
        newMatchesCount
    };
}

/**
 * 매치 상세 조회 (배치)
 */
async function fetchMatchDetails(matchIds, puuid, version) {
    const matches = [];
    const batchSize = 2;

    for (let i = 0; i < matchIds.length; i += batchSize) {
        const batch = matchIds.slice(i, i + batchSize);

        const results = await Promise.all(
            batch.map(id => riotApi.getMatchDetail(id).catch(err => {
                console.warn(`⚠️ 매치 조회 실패: ${id}`, err.message);
                return null;
            }))
        );

        for (const match of results) {
            if (!match) continue;

            const participant = match.info.participants.find(p => p.puuid === puuid);
            if (!participant) continue;

            // 솔랭만 필터 (queueId: 420)
            if (match.info.queueId !== 420) continue;

            matches.push({
                matchId: match.metadata.matchId,
                champion: participant.championName,
                championImage: riotApi.getChampionImageUrl(participant.championName, version),
                win: participant.win,
                kills: participant.kills,
                deaths: participant.deaths,
                assists: participant.assists,
                kda: parseFloat(((participant.kills + participant.assists) / Math.max(1, participant.deaths)).toFixed(2)),
                lane: riotApi.translateLane(participant.teamPosition || participant.individualPosition),
                duration: match.info.gameDuration,
                playedAt: new Date(match.info.gameEndTimestamp)
            });
        }

        // Rate Limit 방지 딜레이
        if (i + batchSize < matchIds.length) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    return matches;
}

/**
 * 응답 포맷팅
 */
function formatResponse(record) {
    return {
        tier: record.tier,
        rank: record.rank,
        leaguePoints: record.leaguePoints,
        overallWinRate: record.overallWinRate,
        recentRanked: record.matches || [],
        lastUpdatedAt: record.lastUpdatedAt
    };
}

/**
 * 갱신 가능 여부 체크
 */
function canRefresh(lastUpdatedAt) {
    if (!lastUpdatedAt) return true;
    return Date.now() - new Date(lastUpdatedAt).getTime() >= REFRESH_COOLDOWN;
}

/**
 * 남은 쿨타임 (초)
 */
function getCooldownRemaining(lastUpdatedAt) {
    if (!lastUpdatedAt) return 0;
    const elapsed = Date.now() - new Date(lastUpdatedAt).getTime();
    const remaining = REFRESH_COOLDOWN - elapsed;
    return Math.max(0, Math.ceil(remaining / 1000));
}
