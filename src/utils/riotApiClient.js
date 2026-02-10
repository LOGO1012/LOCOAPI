// src/utils/riotApiClient.js
// 라이엇 API 호출 유틸리티

import axios from 'axios';

const ACCOUNT_API = 'https://asia.api.riotgames.com';
const MATCH_API = 'https://asia.api.riotgames.com';
const LEAGUE_API = 'https://kr.api.riotgames.com';
const DDRAGON_API = 'https://ddragon.leagueoflegends.com';

/**
 * Riot API 헤더 생성
 */
function riotHeaders() {
    return { headers: { 'X-Riot-Token': process.env.RIOT_API_KEY } };
}

/**
 * Riot API 에러 변환
 */
export function translateRiotError(err, step) {
    const code = err.response?.status;
    if (code === 403)
        return new Error(`[${step}] Riot API 키가 만료되었거나 권한이 없습니다 (403)`);
    if (code === 404)
        return new Error(`[${step}] 정보를 찾을 수 없습니다 (404)`);
    if (code === 429)
        return new Error(`[${step}] Riot 호출 제한 초과 (429)`);
    return new Error(`[${step}] Riot API 호출 실패: ${err.message}`);
}

/**
 * Data Dragon 최신 버전 조회
 */
export async function getLatestVersion() {
    try {
        const { data } = await axios.get(`${DDRAGON_API}/api/versions.json`);
        return data[0];
    } catch (error) {
        console.warn('⚠️ 최신 버전 조회 실패, 기본 버전 사용');
        return '14.1.1';
    }
}

/**
 * Riot ID로 PUUID 조회
 * @param {string} gameName - 게임 닉네임
 * @param {string} tagLine - 태그라인 (예: KR1)
 * @returns {Promise<string>} PUUID
 */
export async function getPuuidByRiotId(gameName, tagLine) {
    try {
        const { data } = await axios.get(
            `${ACCOUNT_API}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${tagLine}`,
            riotHeaders()
        );
        return data.puuid;
    } catch (error) {
        throw translateRiotError(error, '계정 조회');
    }
}

/**
 * PUUID로 랭크 정보 조회
 * @param {string} puuid - PUUID
 * @returns {Promise<Object>} 랭크 정보
 */
export async function getLeagueData(puuid) {
    try {
        const { data } = await axios.get(
            `${LEAGUE_API}/lol/league/v4/entries/by-puuid/${puuid}`,
            riotHeaders()
        );

        const solo = data.find(e => e.queueType === 'RANKED_SOLO_5x5') || {};
        const wins = solo.wins || 0;
        const losses = solo.losses || 0;

        return {
            tier: solo.tier || 'UNRANKED',
            rank: solo.rank || '',
            leaguePoints: solo.leaguePoints || 0,
            wins,
            losses,
            overallWinRate: (wins + losses) > 0
                ? Math.round((wins / (wins + losses)) * 10000) / 100
                : 0
        };
    } catch (error) {
        throw translateRiotError(error, '랭크 정보 조회');
    }
}

/**
 * PUUID로 최근 매치 ID 목록 조회
 * @param {string} puuid - PUUID
 * @param {number} count - 가져올 매치 수
 * @returns {Promise<string[]>} 매치 ID 배열
 */
export async function getMatchIds(puuid, count = 10) {
    try {
        const { data } = await axios.get(
            `${MATCH_API}/lol/match/v5/matches/by-puuid/${puuid}/ids?count=${count}`,
            riotHeaders()
        );
        return data;
    } catch (error) {
        throw translateRiotError(error, '매치 목록 조회');
    }
}

/**
 * 매치 ID로 상세 정보 조회
 * @param {string} matchId - 매치 ID
 * @returns {Promise<Object>} 매치 상세 정보
 */
export async function getMatchDetail(matchId) {
    try {
        const { data } = await axios.get(
            `${MATCH_API}/lol/match/v5/matches/${matchId}`,
            riotHeaders()
        );
        return data;
    } catch (error) {
        throw translateRiotError(error, '매치 상세 조회');
    }
}

/**
 * 챔피언 이미지 URL 생성
 * @param {string} championName - 챔피언 이름
 * @param {string} version - Data Dragon 버전
 * @returns {string} 이미지 URL
 */
export function getChampionImageUrl(championName, version) {
    return `${DDRAGON_API}/cdn/${version}/img/champion/${championName}.png`;
}

/**
 * 라인(포지션) 한글 변환
 * @param {string} lane - 영문 라인명
 * @returns {string} 한글 라인명
 */
export function translateLane(lane) {
    const laneMap = {
        'TOP': '탑',
        'JUNGLE': '정글',
        'MIDDLE': '미드',
        'BOTTOM': '원딜',
        'UTILITY': '서포터',
        'SUPPORT': '서포터'
    };
    return laneMap[lane] || lane || '알 수 없음';
}
