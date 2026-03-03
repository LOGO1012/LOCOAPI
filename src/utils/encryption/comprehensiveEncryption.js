// src/utils/encryption/comprehensiveEncryption.js - 완전 재작성 최적 버전
import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from '@aws-sdk/client-kms';
import crypto from 'crypto';
import CryptoJS from 'crypto-js';
import axios from 'axios';

/**
 * M-22 보안 조치: 암호화 폴백 발생 시 디스코드 웹훅으로 관리자 알림
 * 환경변수: DISCORD_WEBHOOK_URL (디스코드 채널 웹훅 URL)
 */
const notifyFallbackToAdmin = (() => {
    let lastNotified = 0;
    const COOLDOWN = 5 * 60 * 1000; // 5분 쿨다운 (알림 폭주 방지)

    return async (errorMessage, stats) => {
        const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
        if (!webhookUrl) return;

        const now = Date.now();
        if (now - lastNotified < COOLDOWN) return;
        lastNotified = now;

        try {
            await axios.post(webhookUrl, {
                embeds: [{
                    title: 'KMS 암호화 폴백 발생',
                    color: 0xff9900,
                    fields: [
                        { name: '오류 내용', value: errorMessage || '알 수 없음', inline: false },
                        { name: '폴백 누적 횟수', value: `${stats.fallbackUsage}회`, inline: true },
                        { name: '총 오류 횟수', value: `${stats.errors}회`, inline: true },
                        { name: '서버 가동 시간', value: `${Math.floor((now - stats.startTime) / 1000)}초`, inline: true }
                    ],
                    timestamp: new Date().toISOString()
                }]
            });
        } catch {
            // 알림 실패가 암호화 흐름을 중단시키지 않음
        }
    };
})();

/**
 * 🔐 최적화된 KMS 암호화 시스템 - 완전 재작성
 */
class OptimalKMSEncryption {

    /**
     * 🔄 실시간 환경 설정 재검증
     */
    revalidateConfig() {
        const currentKMSState = process.env.ENABLE_KMS === 'true';
        if (this.kmsEnabled !== currentKMSState) {
            console.log('⚠️ [실시간] KMS 상태 불일치 감지! 설정을 업데이트합니다.');
            this.initializeConfig(); // 모든 설정을 새로고침
            this._kmsClient = null; // KMS 클라이언트 재생성 강제
        }
    }


    constructor() {
        console.log('🏗️ KMS 암호화 시스템 초기화 시작...');
        
        // 📋 환경 설정 초기화
        this.initializeConfig();
        
        // 🔑 KMS 클라이언트 (지연 로딩)
        this._kmsClient = null;
        
        // 💾 LRU 캐시 시스템 초기화
        this.initializeCache();
        
        // 📊 모니터링 통계 초기화
        this.initializeStats();
        
        console.log(`✅ KMS 암호화 시스템 초기화 완료: ${this.kmsEnabled ? 'KMS 모드' : 'AES 폴백 모드'}`);
    }

    /**
     * 🔧 환경 설정 초기화
     * 역할: 환경변수 로드 및 검증, 기본값 설정
     */
    initializeConfig() {
        // 🔧 환경변수 강제 리로드
        this.kmsEnabled = process.env.ENABLE_KMS === 'true';
        
        console.log(`🔧 KMS 설정: ENABLE_KMS=${this.kmsEnabled}`);
        
        this.awsConfig = {
            region: process.env.AWS_REGION || 'ap-northeast-2',
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        };
        
        this.kmsKeyId = process.env.KMS_KEY_ID || 'alias/loco-user-data';
        this.fallbackKey = process.env.ENCRYPTION_SECRET || 'LOCO-2024-SUPER-SECRET-KEY-FOR-AES256-ENCRYPTION-SYSTEM-32CHAR';
        
        this.cacheConfig = {
            maxSize: parseInt(process.env.KMS_CACHE_MAX_SIZE) || 50,
            ttl: parseInt(process.env.KMS_CACHE_EXPIRY) || 1800000
        };
        
        console.log(`🔧 환경 설정: KMS=${this.kmsEnabled}`);
    }

    /**
     * 💾 캐시 시스템 초기화
     */
    initializeCache() {
        this.dataKeyCache = new Map();
        this.cacheAccessOrder = new Set();
        
        this.cacheCleanupTimer = setInterval(() => {
            this.cleanupExpiredCache();
        }, 3600000);
        
        console.log(`💾 캐시 시스템 초기화 완료`);
    }

    /**
     * 📊 통계 시스템 초기화
     */
    initializeStats() {
        this.stats = {
            encryptions: 0,
            decryptions: 0,
            kmsOperations: 0,
            cacheHits: 0,
            cacheMisses: 0,
            errors: 0,
            fallbackUsage: 0,
            startTime: Date.now()
        };
    }

    /**
     * 🔑 KMS 클라이언트 지연 로딩
     */
    get kmsClient() {
        if (!this._kmsClient && this.kmsEnabled) {
            try {
                // 🔧 실시간 환경변수 사용
                const currentAwsConfig = {
                    region: process.env.AWS_REGION || 'ap-northeast-2',
                    credentials: {
                        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    }
                };
                
                console.log('🔧 KMS 클라이언트 생성 시도:', {
                    region: currentAwsConfig.region,
                    hasAccessKey: !!currentAwsConfig.credentials.accessKeyId,
                    hasSecretKey: !!currentAwsConfig.credentials.secretAccessKey
                });
                
                this._kmsClient = new KMSClient(currentAwsConfig);
                console.log('✅ KMS 클라이언트 생성 완료');
            } catch (error) {
                console.error('❌ KMS 클라이언트 생성 실패:', error.message);
                throw new Error(`KMS 클라이언트 초기화 실패: ${error.message}`);
            }
        }
        return this._kmsClient;
    }

    /**
     * 🔐 개인정보 암호화 (메인 함수)
     */
    async encryptPersonalInfo(plaintext) {
        this.revalidateConfig();
        if (!plaintext || typeof plaintext !== 'string') {
            return '';
        }

        this.stats.encryptions++;

        try {
            if (this.kmsEnabled) {
                return await this.encryptWithKMS(plaintext);
            } else {
                return await this.encryptWithAES(plaintext);
            }
        } catch (error) {
            this.stats.errors++;
            console.error('❌ 암호화 실패:', error.message);
            
            if (this.kmsEnabled) {
                console.log('🔄 KMS 실패, AES 폴백 시도...');
                this.stats.fallbackUsage++;
                // M-22 보안 조치: 관리자 디스코드 알림 (fire-and-forget)
                notifyFallbackToAdmin(error.message, this.stats);
                return await this.encryptWithAES(plaintext);
            }
            
            throw new Error(`암호화 실패: ${error.message}`);
        }
    }

    /**
     * 🔓 개인정보 복호화 (메인 함수)
     */
    async decryptPersonalInfo(encryptedData) {
        this.revalidateConfig();
        if (!encryptedData) {
            return '';
        }

        this.stats.decryptions++;

        try {
            if (encryptedData.startsWith('{')) {
                const parsed = JSON.parse(encryptedData);
                
                if (parsed.method === 'KMS') {
                    return await this.decryptWithKMS(parsed);
                } else {
                    return await this.decryptWithAESNew(parsed.data);
                }
            } else {
                return this.decryptLegacyAES(encryptedData);
            }
        } catch (error) {
            this.stats.errors++;
            console.error('❌ 복호화 실패:', error.message);
            
            try {
                return this.decryptLegacyAES(encryptedData);
            } catch (fallbackError) {
                console.error('❌ 폴백 복호화도 실패:', fallbackError.message);
                return '';
            }
        }
    }

    /**
     * 🔐 KMS 암호화 실행
     */
    async encryptWithKMS(plaintext) {
        console.log('🏗️ KMS 암호화 시작...');
        try {
            console.log('🔑 KMS 데이터 키 획득 중...');
            const dataKey = await this.getDataKey();
            
            console.log('🔐 AES-256-GCM 암호화 실행 중...');
            const encryptedResult = this.performAESEncryption(plaintext, dataKey.plaintextKey);
            
            const result = {
                method: 'KMS',
                version: '2.0',
                data: encryptedResult,
                encryptedKey: dataKey.encryptedKey,
                timestamp: Date.now()
            };
            
            this.stats.kmsOperations++;
            console.log('✅ KMS 암호화 완료');
            return JSON.stringify(result);
        } catch (error) {
            console.error('❌ KMS 암호화 실패:', error.message);
            console.error('🔍 KMS 암호화 상세 에러:', error.stack);
            throw error;
        }
    }

    /**
     * 🔓 KMS 복호화 실행
     */
    async decryptWithKMS(encryptedObj) {
        try {
            const plaintextKey = await this.decryptDataKey(encryptedObj.encryptedKey);
            const decrypted = this.performAESDecryption(encryptedObj.data, plaintextKey);
            
            this.stats.kmsOperations++;
            // 성능 최적화: KMS 복호화 로그는 디버그 모드에서만 출력
            if (process.env.NODE_ENV === 'development' && process.env.LOG_LEVEL === 'debug') {
                console.log('✅ KMS 복호화 완료');
            }
            return decrypted;
        } catch (error) {
            console.error('❌ KMS 복호화 실패:', error.message);
            throw error;
        }
    }

    /**
     * 🔄 AES 폴백 암호화
     */
    async encryptWithAES(plaintext) {
        try {
            const encryptedResult = this.performAESEncryption(plaintext, this.fallbackKey);
            
            const result = {
                method: 'AES',
                version: '2.0',
                data: encryptedResult,
                timestamp: Date.now()
            };
            
            console.log('✅ AES 폴백 암호화 완료');
            return JSON.stringify(result);
        } catch (error) {
            console.error('❌ AES 암호화 실패:', error.message);
            throw error;
        }
    }

    /**
     * 🔧 AES-256-GCM 암호화 실행 (최신 Node.js API)
     */
    performAESEncryption(plaintext, key) {
        try {
            // 키 처리 및 정규화
            let keyBuffer;
            if (key.length === 32) {
                keyBuffer = Buffer.from(key, 'utf8');
            } else {
                keyBuffer = Buffer.from(key, 'base64');
            }
            
            // 32바이트로 조정 (AES-256 요구사항)
            if (keyBuffer.length !== 32) {
                const hash = crypto.createHash('sha256');
                hash.update(keyBuffer);
                keyBuffer = hash.digest();
            }
            
            const iv = crypto.randomBytes(12); // GCM 모드용 12바이트 IV
            
            // ✅ 최신 API 사용: createCipheriv
            const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
            
            let encrypted = cipher.update(plaintext, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            return {
                iv: iv.toString('hex'),
                data: encrypted,
                authTag: authTag.toString('hex')
            };
        } catch (error) {
            console.error('❌ AES 암호화 실행 실패:', error.message);
            // 간단한 폴백: CryptoJS로 처리
            try {
                const encrypted = CryptoJS.AES.encrypt(plaintext, key).toString();
                return {
                    iv: '',
                    data: encrypted,
                    authTag: ''
                };
            } catch (fallbackError) {
                console.error('❌ 폴백 암호화도 실패:', fallbackError.message);
                throw error;
            }
        }
    }

    /**
     * 🔧 AES-256-GCM 복호화 실행 (최신 Node.js API)
     */
    performAESDecryption(encryptedObj, key) {
        try {
            // CryptoJS 폴백 형식 처리 (새 형식에서 authTag가 빈 문자열인 경우)
            if (!encryptedObj.authTag || encryptedObj.authTag === '') {
                const bytes = CryptoJS.AES.decrypt(encryptedObj.data, key);
                const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                if (!decrypted) {
                    throw new Error('복호화 결과가 븈 문자열입니다');
                }
                return decrypted;
            }
            
            // 정상 GCM 복호화 시도 - 최신 API 사용
            let keyBuffer;
            if (key.length === 32) {
                keyBuffer = Buffer.from(key, 'utf8');
            } else {
                keyBuffer = Buffer.from(key, 'base64');
            }
            
            if (keyBuffer.length !== 32) {
                const hash = crypto.createHash('sha256');
                hash.update(keyBuffer);
                keyBuffer = hash.digest();
            }
            
            const iv = Buffer.from(encryptedObj.iv, 'hex');
            const authTag = Buffer.from(encryptedObj.authTag, 'hex');
            
            // ✅ 최신 API 사용: createDecipheriv
            const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
            decipher.setAuthTag(authTag);
            
            let decrypted = decipher.update(encryptedObj.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('❌ AES 복호화 실행 실패:', error.message);
            
            // 폴백: CryptoJS로 시도
            try {
                const bytes = CryptoJS.AES.decrypt(encryptedObj.data, key);
                const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                if (!decrypted) {
                    throw new Error('폴백 복호화 결과가 빈 문자열입니다');
                }
                return decrypted;
            } catch (fallbackError) {
                console.error('❌ 폴백 복호화도 실패:', fallbackError.message);
                throw error;
            }
        }
    }

    /**
     * 🔑 KMS 데이터 키 획득 (캐시 포함)
     */
    async getDataKey() {
        const cacheKey = 'main_data_key';
        console.log('🔍 데이터 키 캐시 확인 중...');
        
        // 캐시 확인
        if (this.dataKeyCache.has(cacheKey)) {
            const cached = this.dataKeyCache.get(cacheKey);
            
            if (Date.now() - cached.timestamp < this.cacheConfig.ttl) {
                this.stats.cacheHits++;
                this.updateCacheAccessOrder(cacheKey);
                console.log('💾 캐시에서 데이터 키 사용');
                return cached.dataKey;
            } else {
                console.log('⏰ 캐시 만료, 새 키 생성 필요');
                this.dataKeyCache.delete(cacheKey);
                this.cacheAccessOrder.delete(cacheKey);
            }
        } else {
            console.log('💭 캐시에 데이터 키 없음, 새로 생성');
        }

        // 새 데이터 키 생성
        try {
            console.log('🌐 AWS KMS 연결 시도...');
            
            const command = new GenerateDataKeyCommand({
                KeyId: this.kmsKeyId,
                KeyUsage: 'ENCRYPT_DECRYPT',
                KeySpec: 'AES_256'
            });

            console.log('📡 KMS 데이터 키 생성 명령 전송...');
            const response = await this.kmsClient.send(command);
            
            console.log('✅ KMS에서 응답 받음');
            const dataKey = {
                plaintextKey: Buffer.from(response.Plaintext).toString('base64'),
                encryptedKey: Buffer.from(response.CiphertextBlob).toString('base64')
            };

            this.cacheDataKey(cacheKey, dataKey);
            
            this.stats.cacheMisses++;
            this.stats.kmsOperations++;
            console.log('🔑 새 KMS 데이터 키 생성 및 캐시 저장 완료');
            
            return dataKey;
        } catch (error) {
            console.error('❌ KMS 데이터 키 생성 실패:', error.message);
            console.error('🔍 AWS 연결 상세 에러:', error.stack);
            
            if (error.name === 'AccessDenied' || error.name === 'AccessDeniedException') {
                console.error('🚫 AWS 접근 권한 문제입니다. IAM 설정을 확인해주세요.');
            } else if (error.name === 'NotFoundException') {
                console.error('❓ KMS 키를 찾을 수 없습니다. 키 ID/별칭을 확인해주세요.');
            }
            
            throw error;
        }
    }

    /**
     * 🔓 KMS 데이터 키 복호화
     */
    async decryptDataKey(encryptedKey) {
        try {
            const command = new DecryptCommand({
                CiphertextBlob: Buffer.from(encryptedKey, 'base64')
            });

            const response = await this.kmsClient.send(command);
            return Buffer.from(response.Plaintext).toString('base64');
        } catch (error) {
            console.error('❌ KMS 데이터 키 복호화 실패:', error.message);
            throw error;
        }
    }

    /**
     * 💾 데이터 키 캐시 저장 (LRU 관리)
     */
    cacheDataKey(key, dataKey) {
        if (this.dataKeyCache.size >= this.cacheConfig.maxSize) {
            const oldestKey = this.cacheAccessOrder.values().next().value;
            this.dataKeyCache.delete(oldestKey);
            this.cacheAccessOrder.delete(oldestKey);
        }

        this.dataKeyCache.set(key, {
            dataKey,
            timestamp: Date.now()
        });
        
        this.updateCacheAccessOrder(key);
    }

    /**
     * 🔄 캐시 접근 순서 업데이트 (LRU 관리)
     */
    updateCacheAccessOrder(key) {
        this.cacheAccessOrder.delete(key);
        this.cacheAccessOrder.add(key);
    }

    /**
     * 🧹 만료된 캐시 항목 정리
     */
    cleanupExpiredCache() {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [key, cached] of this.dataKeyCache.entries()) {
            if (now - cached.timestamp > this.cacheConfig.ttl) {
                this.dataKeyCache.delete(key);
                this.cacheAccessOrder.delete(key);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`🧹 만료된 캐시 항목 ${cleanedCount}개 정리 완료`);
        }
    }

    /**
     * 🔄 새 형식 AES 복호화
     */
    async decryptWithAESNew(encryptedData) {
        try {
            return this.performAESDecryption(encryptedData, this.fallbackKey);
        } catch (error) {
            console.error('❌ 새 형식 AES 복호화 실패:', error.message);
            throw error;
        }
    }

    /**
     * 🔄 기존 형식 AES 복호화 (하위 호환성)
     */
    decryptLegacyAES(encryptedText) {
        try {
            const bytes = CryptoJS.AES.decrypt(encryptedText, this.fallbackKey);
            const decrypted = bytes.toString(CryptoJS.enc.Utf8);
            
            if (!decrypted) {
                throw new Error('복호화 결과가 빈 문자열입니다');
            }
            
            console.log('✅ 기존 형식 AES 복호화 완료');
            return decrypted;
        } catch (error) {
            console.error('❌ 기존 형식 AES 복호화 실패:', error.message);
            throw error;
        }
    }

    /**
     * 🎯 사용자 데이터 암호화 (회원가입/수정 시 사용)
     */
    async encryptUserData(userData) {
        try {
            console.log('🔐 사용자 데이터 암호화 시작...');
            
            const encryptedData = { ...userData };

            // 개인정보 필드 암호화
            if (userData.name) {
                encryptedData.name = await this.encryptPersonalInfo(userData.name);
                encryptedData.name_hash = this.createSearchHash(userData.name);
            }

            if (userData.phone) {
                encryptedData.phone = await this.encryptPersonalInfo(userData.phone);
                encryptedData.phone_hash = this.createPhoneHash(userData.phone);
            }

            if (userData.birthdate) {
                encryptedData.birthdate = await this.encryptPersonalInfo(userData.birthdate);
                encryptedData.birthdate_hash = this.createSearchHash(userData.birthdate);
            }

            // 본인인증 CI 암호화 (ci_hash는 이미 해시값이므로 그대로 유지)
            if (userData.ci) {
                encryptedData.ci = await this.encryptPersonalInfo(userData.ci);
            }

            // 소셜 로그인 정보 암호화
            if (userData.social?.kakao) {
                encryptedData.social.kakao = await this.encryptSocialData(userData.social.kakao, 'kakao');
            }

            if (userData.social?.naver) {
                encryptedData.social.naver = await this.encryptSocialData(userData.social.naver, 'naver');
            }

            console.log('✅ 사용자 데이터 암호화 완료');
            return encryptedData;
        } catch (error) {
            console.error('❌ 사용자 데이터 암호화 실패:', error.message);
            this.stats.errors++;
            throw error;
        }
    }

    /**
     * 🔐 소셜 로그인 데이터 암호화
     */
    async encryptSocialData(socialData, provider) {
        const encrypted = { ...socialData };

        if (socialData.name) {
            encrypted.name = await this.encryptPersonalInfo(socialData.name);
        }
        
        if (socialData.phoneNumber) {
            encrypted.phoneNumber = await this.encryptPersonalInfo(socialData.phoneNumber);
        }
        
        if (socialData.birthday) {
            encrypted.birthday = await this.encryptPersonalInfo(socialData.birthday.toString());
        }
        
        if (socialData.birthyear) {
            encrypted.birthyear = await this.encryptPersonalInfo(socialData.birthyear.toString());
        }
        
        if (socialData.providerId) {
            encrypted.providerId_hash = this.hashProviderId(socialData.providerId);
        }

        return encrypted;
    }

    /**
     * 🔍 검색용 해시 생성
     */
    createSearchHash(value) {
        if (!value) return '';
        return CryptoJS.SHA256(value.toString().toLowerCase().trim()).toString();
    }

    /**
     * 📱 전화번호 전용 해시
     */
    createPhoneHash(phoneNumber) {
        if (!phoneNumber) return '';
        const normalized = phoneNumber.replace(/[^\d]/g, '');
        return CryptoJS.SHA256(normalized).toString();
    }

    /**
     * 🆔 소셜 로그인 ID 해시
     */
    hashProviderId(providerId) {
        if (!providerId) return '';
        return CryptoJS.SHA256(providerId.toString()).toString();
    }

    /**
     * 🔍 소셜 로그인 사용자 검색
     */
    async findUserBySocialId(UserModel, provider, providerId) {
        if (!providerId) return null;
        
        const hashField = `social.${provider}.providerId_hash`;
        const hashedId = this.hashProviderId(providerId);
        
        return await UserModel.findOne({ [hashField]: hashedId });
    }

    /**
     * 🧪 KMS 연결 테스트 (상세 로그 포함)
     */
    async testKMSConnection() {
        // 🔧 환경변수 실시간 재확인
        const currentKMSState = process.env.ENABLE_KMS === 'true';
        
        console.log('🏗️ KMS 테스트 시작 - 환경 설정 확인...');
        console.log('🔧 환경변수 실시간 확인:', {
            ENABLE_KMS_BOOLEAN: currentKMSState,
            INSTANCE_KMS_STATE: this.kmsEnabled
        });
        
        // 환경변수와 인스턴스 상태가 다르면 업데이트
        if (this.kmsEnabled !== currentKMSState) {
            console.log('⚠️ KMS 상태 불일치 감지, 업데이트 중...');
            this.kmsEnabled = currentKMSState;
            this.kmsKeyId = process.env.KMS_KEY_ID || 'alias/loco-user-data';
            
            // 🔧 AWS 인증 정보도 함께 업데이트
            this.awsConfig = {
                region: process.env.AWS_REGION || 'ap-northeast-2',
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            };
            
            // 🔧 KMS 클라이언트 재생성 강제
            this._kmsClient = null;
            
            console.log('✅ KMS 설정 업데이트 완료:', {
                newKMSState: this.kmsEnabled,
                hasAccessKey: !!this.awsConfig.accessKeyId,
                hasSecretKey: !!this.awsConfig.secretAccessKey
            });
        }
        
        console.log(`🔧 KMS 활성화: ${this.kmsEnabled}`);
        
        if (!this.kmsEnabled) {
            console.log('⚠️ KMS가 비활성화되어 있습니다. AES 모드로 테스트합니다.');
        } else {
            console.log('✅ KMS가 활성화되어 있습니다. KMS 모드로 테스트합니다.');
        }

        try {
            const testData = '🧪 KMS 연결 테스트 데이터';
            console.log('🧪 암호화/복호화 테스트 시작...');
            console.log('📝 테스트 데이터 준비 완료');
            
            console.log('🔐 암호화 시도 중...');
            
            if (this.kmsEnabled) {
                console.log('🏗️ KMS 암호화 시작...');
            } else {
                console.log('🔧 AES 폴백 암호화 시작...');
            }
            
            const encrypted = await this.encryptPersonalInfo(testData);
            
            if (this.kmsEnabled) {
                console.log('✅ KMS 암호화 완료');
            } else {
                console.log('✅ AES 폴백 암호화 완료');
            }
            
            console.log('✅ 암호화 테스트 성공');
            console.log(`📦 암호화된 데이터 길이: ${encrypted.length} bytes`);
            
            console.log('🔓 복호화 시도 중...');
            const decrypted = await this.decryptPersonalInfo(encrypted);
            console.log('✅ 복호화 테스트 성공');
            console.log('📝 복호화 검증 완료');
            
            if (decrypted === testData) {
                console.log('🎉 KMS 암호화 시스템 테스트 완전 성공!');
                console.log('📊 현재 통계:', this.getStats());
                return true;
            } else {
                console.error('❌ 복호화된 데이터가 원본과 다릅니다');
                console.error('원본과 복호화 결과 불일치');
                return false;
            }
        } catch (error) {
            console.error('❌ KMS 연결 테스트 실패:', error.message);
            console.error('🔍 에러 상세:', error.stack);
            return false;
        }
    }

    /**
     * 📊 통계 정보 조회
     */
    getStats() {
        const uptime = Date.now() - this.stats.startTime;
        
        return {
            ...this.stats,
            mode: this.kmsEnabled ? 'KMS' : 'AES Fallback',
            cacheSize: this.dataKeyCache.size,
            uptime: Math.floor(uptime / 1000),
            cacheHitRate: this.stats.cacheHits + this.stats.cacheMisses > 0 
                ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * 🧹 캐시 수동 정리
     */
    clearCache() {
        const beforeSize = this.dataKeyCache.size;
        this.dataKeyCache.clear();
        this.cacheAccessOrder.clear();
        console.log(`🧹 캐시 수동 정리 완료: ${beforeSize}개 항목 삭제`);
    }

    /**
     * 🔄 시스템 종료 시 정리 작업
     */
    destroy() {
        if (this.cacheCleanupTimer) {
            clearInterval(this.cacheCleanupTimer);
            this.cacheCleanupTimer = null;
        }
        this.clearCache();
        console.log('💀 KMS 암호화 시스템 종료 완료');
    }

    // ============================================================================
    //   🧮 나이 계산 관련 유틸리티 함수들 (기존 호환성 유지)
    // ============================================================================

    /**
     * 📅 나이 계산
     */
    calculateAge(birthdate) {
        if (!birthdate) return null;
        
        try {
            const today = new Date();
            const birth = new Date(birthdate);
            let age = today.getFullYear() - birth.getFullYear();
            const monthDiff = today.getMonth() - birth.getMonth();
            
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
                age--;
            }
            
            return age;
        } catch (error) {
            console.warn('⚠️ 나이 계산 실패:', error.message);
            return null;
        }
    }

    /**
     * 👥 연령대 분류 (청소년보호법 제2조 기준)
     * 만 19세가 되는 해의 1월 1일부터 성인
     */
    getAgeGroup(birthdate) {
        if (!birthdate) return null;
        try {
            const birth = new Date(birthdate);
            if (isNaN(birth.getTime())) return null;
            const currentYear = new Date().getFullYear();
            return (currentYear - birth.getFullYear()) < 19 ? 'minor' : 'adult';
        } catch (error) {
            console.warn('연령대 분류 실패:', error.message);
            return null;
        }
    }

    /**
     * 🔞 미성년자 확인 (청소년보호법 제2조 기준)
     * 만 19세가 되는 해의 1월 1일부터 성인
     */
    isMinor(birthdate) {
        if (!birthdate) return null;
        try {
            const birth = new Date(birthdate);
            if (isNaN(birth.getTime())) return null;
            const currentYear = new Date().getFullYear();
            return (currentYear - birth.getFullYear()) < 19;
        } catch (error) {
            console.warn('미성년자 확인 실패:', error.message);
            return null;
        }
    }
}

// ============================================================================
//   🔐 싱글톤 인스턴스 생성 및 내보내기
// ============================================================================

const optimalKMSEncryption = new OptimalKMSEncryption();

// 프로세스 종료 시 정리 작업
process.on('SIGTERM', () => {
    console.log('📡 SIGTERM 신호 수신, 암호화 시스템 정리 중...');
    optimalKMSEncryption.destroy();
});

process.on('SIGINT', () => {
    console.log('📡 SIGINT 신호 수신, 암호화 시스템 정리 중...');
    optimalKMSEncryption.destroy();
});

export default optimalKMSEncryption;