// src/middlewares/getLoLRecordBySummonerName.js

import axios from 'axios';

const ACCOUNT_API   = 'https://asia.api.riotgames.com';
const SUMMONER_API  = 'https://kr.api.riotgames.com';
const MATCH_API     = 'https://asia.api.riotgames.com';
const LEAGUE_API    = 'https://kr.api.riotgames.com';

export async function getLoLRecordByRiotId(riotId) {
    // 1) Riot ID 파싱
    const [gameName, tagLine] = riotId.split('#');
    if (!tagLine) throw new Error('Invalid Riot ID format');

    // 2) PUUID 조회
    const { data: account } = await axios.get(
        `${ACCOUNT_API}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${tagLine}`,
        { headers: { 'X-Riot-Token': process.env.RIOT_API_KEY } }
    );
    const puuid = account.puuid;
    if (!puuid) throw new Error('PUUID를 가져오지 못했습니다.');

    // 3) Summoner 정보 조회
    const { data: summoner } = await axios.get(
        `${SUMMONER_API}/lol/summoner/v4/summoners/by-puuid/${puuid}`,
        { headers: { 'X-Riot-Token': process.env.RIOT_API_KEY } }
    );

    // 4) Solo/Duo 랭크 통계 조회
    const { data: leagueEntries } = await axios.get(
        `${LEAGUE_API}/lol/league/v4/entries/by-summoner/${summoner.id}`,
        { headers: { 'X-Riot-Token': process.env.RIOT_API_KEY } }
    );
    const solo = leagueEntries.find(e => e.queueType === 'RANKED_SOLO_5x5') || {};
    const tier         = solo.tier         || 'Unranked';
    const rank         = solo.rank         || '';
    const leaguePoints = solo.leaguePoints || 0;
    const totalWins    = solo.wins         || 0;
    const totalLosses  = solo.losses       || 0;
    const overallWinRate = (totalWins + totalLosses) > 0
        ? Math.round((totalWins / (totalWins + totalLosses)) * 10000) / 100
        : 0;

    // 5) 최근 매치 ID 5개 조회
    const { data: matchIds } = await axios.get(
        `${MATCH_API}/lol/match/v5/matches/by-puuid/${puuid}/ids?count=5`,
        { headers: { 'X-Riot-Token': process.env.RIOT_API_KEY } }
    );

    // 6) 매치 상세정보 배치 조회
    const batchSize = 2;
    const allMatches = [];
    for (let i = 0; i < matchIds.length; i += batchSize) {
        const batch = matchIds.slice(i, i + batchSize);
        const results = await Promise.all(
            batch.map(id =>
                axios.get(`${MATCH_API}/lol/match/v5/matches/${id}`, {
                    headers: { 'X-Riot-Token': process.env.RIOT_API_KEY }
                }).then(res => res.data)
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
                matchId:  m.metadata.matchId,
                champion: p.championName,
                win:      p.win,
                kda:      ((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2),
                cs:       p.totalMinionsKilled + p.neutralMinionsKilled,
                duration: m.info.gameDuration
            };
        });

    // 8) 결과 반환
    return {
        summoner,        // { id, name, puuid, profileIconId, summonerLevel, ... }
        tier,            // e.g. "GOLD"
        rank,            // e.g. "IV"
        leaguePoints,    // e.g. 23
        overallWinRate,  // e.g. 52.75
        recentRanked     // 최근 10판 요약 배열
    };
}
