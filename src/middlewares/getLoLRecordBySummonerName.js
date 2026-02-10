// src/middlewares/getLoLRecordBySummonerName.js
//
// ⚠️ DEPRECATED - 이 파일은 더 이상 사용되지 않습니다.
//
// 새로운 구현 위치:
//   - utils/riotApiClient.js    : API 호출 유틸리티
//   - services/riotService.js   : 비즈니스 로직 (DB 캐싱)
//   - controllers/riotController.js : HTTP 핸들러
//   - routes/riotRoutes.js      : 라우트 정의 (/api/riot/lol/...)
//
// 이 파일은 참조용으로 유지되며, 추후 삭제 예정입니다.
// =========================================================================

import axios from 'axios';

const ACCOUNT_API = 'https://asia.api.riotgames.com';
const MATCH_API = 'https://asia.api.riotgames.com';
const LEAGUE_API = 'https://kr.api.riotgames.com';
const DDRAGON_API = 'https://ddragon.leagueoflegends.com';

function riotHeaders() {
    return { headers: { 'X-Riot-Token': process.env.RIOT_API_KEY } };
}

// Data Dragon 최신 버전 가져오기
async function getLatestVersion() {
    try {
        const { data } = await axios.get(`${DDRAGON_API}/api/versions.json`);
        return data[0]; // 첫 번째 요소가 최신 버전
    } catch (error) {
        console.warn('최신 버전을 가져오지 못했습니다. 기본 버전을 사용합니다.');
        return '13.24.1'; // 기본값
    }
}

// 챔피언 이미지 URL 생성
function getChampionImageUrl(championName, version) {
    return `${DDRAGON_API}/cdn/${version}/img/champion/${championName}.png`;
}

function translateRiotError(err, step) {
    const code = err.response?.status;
    if (code === 403)
        return new Error(`[${step}] Riot API 키가 만료되었거나 권한이 없습니다 (403)`);
    if (code === 404)
        return new Error(`[${step}] 정보를 찾을 수 없습니다 (404)`);
    if (code === 429)
        return new Error(`[${step}] Riot 호출 제한 초과 (429)`);
    return new Error(`[${step}] Riot API 호출 실패: ${err.message}`);
}

function translateLane(lane) {
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

export async function getLoLRecordByRiotId(riotId) {
    // 1) Riot ID 파싱
    const [gameName, tagLine] = riotId.split('#');
    if (!tagLine) throw new Error('잘못된 Riot ID 형식');

    // 2) PUUID 조회
    let account;
    try {
        ({ data: account } = await axios.get(
            `${ACCOUNT_API}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${tagLine}`,
            riotHeaders()
        ));
    } catch (e) {
        throw translateRiotError(e, '계정 조회');
    }

    const puuid = account.puuid;
    if (!puuid) throw new Error('PUUID를 가져오지 못했습니다.');

    // 3) Data Dragon 최신 버전 가져오기
    const version = await getLatestVersion();

    // 4) Solo/Duo 랭크 통계 조회
    const { data: leagueEntries } = await axios.get(
        `${LEAGUE_API}/lol/league/v4/entries/by-puuid/${puuid}`,
        { headers: { 'X-Riot-Token': process.env.RIOT_API_KEY } }
    );

    const solo = leagueEntries.find(e => e.queueType === 'RANKED_SOLO_5x5') || {};
    const tier = solo.tier || 'Unranked';
    const rank = solo.rank || '';
    const leaguePoints = solo.leaguePoints || 0;
    const totalWins = solo.wins || 0;
    const totalLosses = solo.losses || 0;
    const overallWinRate = (totalWins + totalLosses) > 0
        ? Math.round((totalWins / (totalWins + totalLosses)) * 10000) / 100
        : 0;

    // 5) 최근 매치 ID 10개 조회
    const { data: matchIds } = await axios.get(
        `${MATCH_API}/lol/match/v5/matches/by-puuid/${puuid}/ids?count=10`,
        riotHeaders()
    );

    // 6) 매치 상세정보 배치 조회
    const batchSize = 2;
    const allMatches = [];
    for (let i = 0; i < matchIds.length; i += batchSize) {
        const batch = matchIds.slice(i, i + batchSize);
        const results = await Promise.all(
            batch.map(id =>
                axios.get(`${MATCH_API}/lol/match/v5/matches/${id}`, riotHeaders()).then(res => res.data)
            )
        );
        allMatches.push(...results);
        if (i + batchSize < matchIds.length) {
            await new Promise(r => setTimeout(r, 4000));
        }
    }

    // 7) 최근 랭크전 10판 필터·정리 (Solo420, Flex440)
    const recentRanked = allMatches
        .filter(m => [420].includes(m.info.queueId))
        .sort((a, b) => b.info.gameCreation - a.info.gameCreation)
        .slice(0, 10)
        .map(m => {
            const p = m.info.participants.find(x => x.puuid === puuid);
            return {
                matchId: m.metadata.matchId,
                champion: p.championName,
                championImage: getChampionImageUrl(p.championName, version), // 챔피언 이미지 URL 추가
                win: p.win,
                kda: ((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2),
                kills: p.kills,
                deaths: p.deaths,
                assists: p.assists,
                lane: translateLane(p.teamPosition || p.individualPosition),
                duration: m.info.gameDuration
            };
        });

    // 8) 결과 반환
    return {
        tier,
        rank,
        leaguePoints,
        overallWinRate,
        recentRanked // 이제 championImage 필드가 포함됨
    };
}
