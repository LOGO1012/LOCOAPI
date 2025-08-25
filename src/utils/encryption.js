// src/utils/encryption.js
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// 32바이트(256비트) 키 생성 - 기존 키가 없으면 새로 생성
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || (() => {
    console.warn('⚠️ ENCRYPTION_KEY가 설정되지 않았습니다. 임시 키를 사용합니다. .env 파일에 ENCRYPTION_KEY를 설정하세요.');
    return 'temp-key-for-development-only!!';
})();

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // AES 블록 크기

/**
 * 텍스트 암호화
 * @param {string} text - 암호화할 텍스트
 * @returns {string} - 암호화된 텍스트 (iv:encrypted 형태)
 */
export const encrypt = (text) => {
    try {
        // 빈 값이나 null 처리
        if (!text || text === '' || text === null || text === undefined) {
            return text;
        }

        // 이미 암호화된 데이터인지 확인 (iv:encrypted 형태)
        if (typeof text === 'string' && text.includes(':') && text.length > 32) {
            // 간단한 암호화 형태 검증
            const parts = text.split(':');
            if (parts.length === 2 && parts[0].length === 32) {
                return text; // 이미 암호화됨
            }
        }

        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipher(ALGORITHM, ENCRYPTION_KEY);
        
        let encrypted = cipher.update(text.toString(), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        // IV와 암호화된 텍스트를 ':'로 구분하여 저장
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error('암호화 오류:', error);
        return text; // 오류 시 원본 반환 (기능 중단 방지)
    }
};

/**
 * 텍스트 복호화
 * @param {string} text - 복호화할 텍스트 (iv:encrypted 형태)
 * @returns {string} - 복호화된 텍스트
 */
export const decrypt = (text) => {
    try {
        // 빈 값이나 null 처리
        if (!text || text === '' || text === null || text === undefined) {
            return text;
        }

        // 암호화 형태가 아닌 경우 (평문)
        if (typeof text !== 'string' || !text.includes(':')) {
            return text; // 평문 그대로 반환
        }

        const textParts = text.split(':');
        if (textParts.length !== 2) {
            return text; // 형태가 맞지 않으면 원본 반환
        }

        const iv = Buffer.from(textParts[0], 'hex');
        const encryptedText = textParts[1];
        
        const decipher = crypto.createDecipher(ALGORITHM, ENCRYPTION_KEY);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        console.error('복호화 오류:', error);
        return text; // 오류 시 원본 반환 (기능 중단 방지)
    }
};

/**
 * 암호화된 데이터인지 확인
 * @param {string} text - 확인할 텍스트
 * @returns {boolean} - 암호화된 데이터 여부
 */
export const isEncrypted = (text) => {
    if (!text || typeof text !== 'string') return false;
    
    const parts = text.split(':');
    return parts.length === 2 && parts[0].length === 32;
};

/**
 * 검색을 위한 해시 생성 (암호화된 데이터 검색 시 사용)
 * @param {string} text - 해시화할 텍스트
 * @returns {string} - 해시값
 */
export const createSearchHash = (text) => {
    if (!text) return text;
    return crypto.createHash('sha256').update(text.toString()).digest('hex');
};
