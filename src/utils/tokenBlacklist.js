// src/utils/tokenBlacklist.js
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import redisClient from '../config/redis.js';

const BL_PREFIX = 'bl:';

/**
 * 토큰의 SHA-256 해시를 생성하여 Redis 키로 사용
 */
const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * 토큰의 남은 TTL(초)을 계산
 * @returns {number} 남은 초 (최소 0)
 */
const getRemainingTTL = (token) => {
    try {
        const decoded = jwt.decode(token);
        if (!decoded || !decoded.exp) return 0;
        const remaining = decoded.exp - Math.floor(Date.now() / 1000);
        return Math.max(remaining, 0);
    } catch {
        return 0;
    }
};

/**
 * 토큰을 블랙리스트에 등록
 * TTL은 토큰의 남은 유효시간과 동일하게 설정 (자동 만료)
 */
export const blacklistToken = async (token) => {
    if (!token) return;
    try {
        const ttl = getRemainingTTL(token);
        if (ttl <= 0) return; // 이미 만료된 토큰은 블랙리스트 불필요

        const key = BL_PREFIX + hashToken(token);
        await redisClient.set(key, '1', { EX: ttl });
    } catch (err) {
        // fail-open: Redis 장애 시에도 로그아웃 플로우는 계속 진행
        console.error('토큰 블랙리스트 등록 실패 (무시):', err.message);
    }
};

/**
 * 토큰이 블랙리스트에 있는지 확인
 * @returns {boolean} 블랙리스트에 있으면 true
 */
export const isBlacklisted = async (token) => {
    if (!token) return false;
    try {
        const key = BL_PREFIX + hashToken(token);
        const result = await redisClient.get(key);
        return result !== null;
    } catch (err) {
        // fail-open: Redis 장애 시 요청 허용 (가용성 우선)
        console.error('토큰 블랙리스트 조회 실패 (무시):', err.message);
        return false;
    }
};
