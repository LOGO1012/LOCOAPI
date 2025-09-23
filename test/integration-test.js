// test/integration-test.js - 전체 시스템 통합 테스트
// 운영진단 도구 삭제하지 말것
import ChatEncryption from '../src/utils/encryption/chatEncryption.js';
import ComprehensiveEncryption from '../src/utils/encryption/comprehensiveEncryption.js';
import { testChatEncryption } from '../src/services/chatService.js';
import friendCache from '../src/utils/cache/friendCache.js';

class IntegrationTest {
    constructor() {
        this.results = {
            encryption: { passed: 0, failed: 0, tests: [] },
            ageVerification: { passed: 0, failed: 0, tests: [] },
            caching: { passed: 0, failed: 0, tests: [] },
            socketIO: { passed: 0, failed: 0, tests: [] },
            overall: { passed: 0, failed: 0 }
        };
    }

    async testEncryption() {
        console.log('암호화 시스템 테스트 시작...');
        
        try {
            const basicTest = ChatEncryption.performanceTest('테스트 메시지입니다! Hello 123');
            this.addResult('encryption', 'ChatEncryption 기본 성능', basicTest.success, {
                encryptTime: basicTest.encryptTime,
                decryptTime: basicTest.decryptTime,
                keywords: basicTest.keywords
            });
            
            const keywords = ChatEncryption.extractKeywords('안녕하세요 Hello 반갑습니다 123');
            const keywordMatch = keywords.length >= 3;
            this.addResult('encryption', '키워드 추출', keywordMatch, {
                extracted: keywords,
                count: keywords.length
            });
            
            const integrationTest = await testChatEncryption();
            this.addResult('encryption', '통합 시스템 테스트', integrationTest.success, integrationTest);
            
        } catch (error) {
            this.addResult('encryption', '암호화 시스템 오류', false, { error: error.message });
        }
    }

    async testAgeVerification() {
        console.log('나이 검증 시스템 테스트 시작...');
        
        try {
            const minorBirthdate = '2008-05-15';
            const minorIsMinor = ComprehensiveEncryption.isMinor(minorBirthdate);
            const minorAgeGroup = ComprehensiveEncryption.getAgeGroup(minorBirthdate);
            
            const minorValid = minorIsMinor === true && minorAgeGroup === 'minor';
            this.addResult('ageVerification', '미성년자 판정', minorValid, {
                input: minorBirthdate,
                isMinor: minorIsMinor,
                ageGroup: minorAgeGroup
            });
            
            const adultBirthdate = '1995-08-20';
            const adultIsMinor = ComprehensiveEncryption.isMinor(adultBirthdate);
            const adultAgeGroup = ComprehensiveEncryption.getAgeGroup(adultBirthdate);
            
            const adultValid = adultIsMinor === false && adultAgeGroup === 'adult';
            this.addResult('ageVerification', '성인 판정', adultValid, {
                input: adultBirthdate,
                isMinor: adultIsMinor,
                ageGroup: adultAgeGroup
            });
            
        } catch (error) {
            this.addResult('ageVerification', '나이 검증 오류', false, { error: error.message });
        }
    }

    async testCaching() {
        console.log('캐싱 시스템 테스트 시작...');
        
        try {
            const testUserId = '507f1f77bcf86cd799439011';
            const testFriends = [
                { _id: '507f1f77bcf86cd799439012', nickname: '친구1' },
                { _id: '507f1f77bcf86cd799439013', nickname: '친구2' }
            ];
            
            await friendCache.cacheFriendList(testUserId, testFriends);
            const cachedFriends = await friendCache.getFriendList(testUserId);
            const cacheHit = cachedFriends && cachedFriends.friends && cachedFriends.friends.length === 2;
            
            this.addResult('caching', '친구 목록 캐싱', cacheHit, {
                stored: testFriends.length,
                retrieved: cachedFriends ? cachedFriends.friends.length : 0
            });
            
            const stats = await friendCache.getFriendCacheStats();
            const statsValid = stats && typeof stats === 'object';
            this.addResult('caching', '캐시 통계 조회', statsValid, stats ? 'success' : 'failed');
            
        } catch (error) {
            this.addResult('caching', '캐싱 시스템 오류', false, { error: error.message });
        }
    }

    async testSocketIO() {
        console.log('Socket.IO 암호화 통합 테스트...');
        
        try {
            const encryptionEnabled = process.env.CHAT_ENCRYPTION_ENABLED === 'true';
            const saltExists = !!process.env.CHAT_SALT && !!process.env.SEARCH_SALT;
            
            this.addResult('socketIO', '환경변수 설정', saltExists, {
                encryptionEnabled,
                chatSalt: !!process.env.CHAT_SALT,
                searchSalt: !!process.env.SEARCH_SALT
            });
            
            try {
                const socketModule = await import('../src/socket/socketIO.js');
                const hasInitFunction = typeof socketModule.initializeSocket === 'function';
                this.addResult('socketIO', 'Socket.IO 모듈 로드', hasInitFunction, {
                    moduleLoaded: true,
                    hasInitFunction
                });
            } catch (importError) {
                this.addResult('socketIO', 'Socket.IO 모듈 로드', false, { error: importError.message });
            }
            
        } catch (error) {
            this.addResult('socketIO', 'Socket.IO 테스트 오류', false, { error: error.message });
        }
    }

    addResult(category, testName, passed, data = {}) {
        const result = { name: testName, passed, data, timestamp: new Date().toISOString() };
        this.results[category].tests.push(result);
        
        if (passed) {
            this.results[category].passed++;
            this.results.overall.passed++;
        } else {
            this.results[category].failed++;
            this.results.overall.failed++;
        }
        
        console.log(`${passed ? '✅' : '❌'} ${testName}: ${passed ? 'PASS' : 'FAIL'}`);
        if (!passed && data.error) {
            console.log(`   오류: ${data.error}`);
        }
    }

    async runAllTests() {
        console.log('LOCO 시스템 최종 통합 테스트 시작');
        console.log('='.repeat(60));
        
        await this.testEncryption();
        console.log();
        await this.testAgeVerification();
        console.log();
        await this.testCaching();
        console.log();
        await this.testSocketIO();
        console.log();
        
        this.printSummary();
        return this.results;
    }

    printSummary() {
        console.log('테스트 결과 요약');
        console.log('='.repeat(60));
        
        Object.keys(this.results).forEach(category => {
            if (category === 'overall') return;
            
            const { passed, failed } = this.results[category];
            const total = passed + failed;
            const percentage = total > 0 ? Math.round((passed / total) * 100) : 0;
            
            console.log(`${category}: ${passed}/${total} (${percentage}%) ${percentage === 100 ? '✅' : percentage >= 80 ? '⚠️' : '❌'}`);
        });
        
        console.log();
        const overallTotal = this.results.overall.passed + this.results.overall.failed;
        console.log(`전체: ${this.results.overall.passed}/${overallTotal} 테스트 통과`);
        
        const overallPercentage = Math.round((this.results.overall.passed / overallTotal) * 100);
        console.log(`시스템 완성도: ${overallPercentage}%`);
        
        if (overallPercentage >= 98) {
            console.log('시스템이 완벽하게 구현되었습니다!');
        } else if (overallPercentage >= 95) {
            console.log('시스템이 거의 완성되었습니다.');
        } else {
            console.log('일부 기능에서 문제가 발견되었습니다.');
        }
    }
}

export default IntegrationTest;
