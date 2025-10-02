// src/utils/encryption/chatEncryption.js
import ComprehensiveEncryption from './comprehensiveEncryption.js';
import crypto from 'crypto';

/**
 * 채팅 메시지 전용 암호화 시스템
 * 기존 ComprehensiveEncryption을 활용하여 채팅에 최적화된 기능 제공
 */
class ChatEncryption {
    
    /**
     * 채팅 메시지 암호화 (AES-256-GCM)
     * @param {string} text - 암호화할 메시지 텍스트
     * @param {string} additionalData - 추가 데이터 (선택적)
     * @returns {object} 암호화된 데이터 {encryptedText, iv, tag}
     */
    static encryptMessage(text, additionalData = '') {
        try {
            if (!text || typeof text !== 'string') {
                throw new Error('유효하지 않은 메시지 텍스트');
            }

            // 1. 채팅 전용 키 생성
            const key = this.deriveChatKey();
            
            // 2. 초기화 벡터 생성 (12바이트, GCM 권장)
            const iv = crypto.randomBytes(12);
            
            // 3. AES-256-GCM 암호화
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            if (additionalData) {
                cipher.setAAD(Buffer.from(additionalData, 'utf8'));
            }
            
            let encrypted = cipher.update(text, 'utf8', 'base64');
            encrypted += cipher.final('base64');
            
            // 4. 인증 태그 추출
            const tag = cipher.getAuthTag();
            
            const result = {
                encryptedText: encrypted,
                iv: iv.toString('base64'),
                tag: tag.toString('base64')
            };
            
            // console.log(`채팅암호화 성공: ${text.length}자 → ${result.encryptedText.length}자`); // 성능 최적화: 주석처리
            return result;
            
        } catch (error) {
            console.error('채팅암호화 실패:', error);
            throw new Error('메시지 암호화 실패: ' + error.message);
        }
    }

    /**
     * 채팅 메시지 복호화
     * @param {object} encryptedData - {encryptedText, iv, tag}
     * @returns {string} 복호화된 메시지 텍스트
     */
    static decryptMessage(encryptedData) {
        try {
            const { encryptedText, iv, tag } = encryptedData;
            
            if (!encryptedText || !iv || !tag) {
                throw new Error('암호화 데이터가 불완전합니다');
            }

            // 1. 채팅 전용 키 생성
            const key = this.deriveChatKey();
            
            // 2. Base64 디코딩
            const encryptedBuffer = Buffer.from(encryptedText, 'base64');
            const ivBuffer = Buffer.from(iv, 'base64');
            const tagBuffer = Buffer.from(tag, 'base64');
            
            // 3. AES-256-GCM 복호화
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
            decipher.setAuthTag(tagBuffer);
            
            let decrypted = decipher.update(encryptedBuffer, null, 'utf8');
            decrypted += decipher.final('utf8');
            
            // console.log(`채팅복호화 성공: ${encryptedText.length}자 → ${decrypted.length}자`); // 성능 최적화: 주석처리
            return decrypted;
            
        } catch (error) {
            console.error('채팅복호화 실패:', error);
            throw new Error('메시지 복호화 실패: ' + error.message);
        }
    }

    /**
     * 채팅 전용 암호화 키 유도
     * 기존 ComprehensiveEncryption의 키를 활용
     */
    static deriveChatKey() {
        try {
            // 기존 시스템의 마스터 키 활용
            const masterKey = process.env.ENCRYPTION_KEY || 'loco_fallback_key_2024';
            const chatSalt = process.env.CHAT_SALT || 'loco_chat_salt_2024_secure_key_v2';
            
            // PBKDF2로 채팅 전용 키 유도
            const derivedKey = crypto.pbkdf2Sync(
                masterKey, 
                chatSalt, 
                100000, // 10만회 반복
                32,     // 32바이트 (256비트)
                'sha256'
            );
            
            return derivedKey;
        } catch (error) {
            console.error('키유도 실패:', error);
            throw new Error('채팅 키 생성 실패');
        }
    }


    /**
     * 암호화/복호화 테스트
     * @param {string} testMessage - 테스트할 메시지
     */
    static performanceTest(testMessage = '안녕하세요! Hello World! 123 테스트') {
        console.log('성능테스트: 채팅 암호화 시스템 테스트 시작...');
        
        try {
            const startTime = Date.now();
            
            // 1. 암호화 테스트
            console.log(`원본 메시지: "${testMessage}"`);
            const encrypted = this.encryptMessage(testMessage);
            const encryptTime = Date.now() - startTime;
            
            // 2. 복호화 테스트
            const decryptStart = Date.now();
            const decrypted = this.decryptMessage(encrypted);
            const decryptTime = Date.now() - decryptStart;
            
            // 5. 결과 검증
            const isSuccess = decrypted === testMessage;
            
            console.log('성능테스트 결과 리포트:');
            console.log(`  암호화 시간: ${encryptTime}ms`);
            console.log(`  복호화 시간: ${decryptTime}ms`);
            console.log(`  총 소요시간: ${Date.now() - startTime}ms`);
            console.log(`  테스트 결과: ${isSuccess ? '성공' : '실패'}`);

            
            if (!isSuccess) {
                console.error(`원본: "${testMessage}"`);
                console.error(`복호화: "${decrypted}"`);
            }
            
            return {
                success: isSuccess,
                encryptTime,
                decryptTime,
                totalTime: Date.now() - startTime,

            };
            
        } catch (error) {
            console.error('성능테스트 실패:', error);
            return { success: false, error: error.message };
        }
    }
}

export default ChatEncryption;
