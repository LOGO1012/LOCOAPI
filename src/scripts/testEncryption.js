// src/scripts/testEncryption.js
import { encrypt, decrypt, isEncrypted } from '../utils/encryption.js';

/**
 * 암호화 기능 테스트
 */
function testEncryption() {
    console.log('🧪 암호화 기능 테스트 시작\n');

    // 테스트 데이터
    const testData = [
        '010-1234-5678',
        '홍길동',
        '1990-01-01',
        'test@example.com',
        '안녕하세요, 채팅 메시지입니다! 😊',
        '', // 빈 문자열
        null, // null 값
        undefined // undefined 값
    ];

    let passedTests = 0;
    let totalTests = 0;

    for (const data of testData) {
        totalTests++;
        console.log(`📝 테스트 ${totalTests}: "${data}"`);

        try {
            // 암호화
            const encrypted = encrypt(data);
            console.log(`   🔒 암호화: ${encrypted}`);

            // 복호화
            const decrypted = decrypt(encrypted);
            console.log(`   🔓 복호화: ${decrypted}`);

            // 암호화 여부 확인
            const isEnc = isEncrypted(encrypted);
            console.log(`   ✅ 암호화 확인: ${isEnc}`);

            // 검증
            if (data === decrypted) {
                console.log(`   ✅ 성공: 원본과 복호화 결과가 일치`);
                passedTests++;
            } else {
                console.log(`   ❌ 실패: 원본과 복호화 결과가 불일치`);
                console.log(`       원본: ${data}`);
                console.log(`       복호화: ${decrypted}`);
            }
        } catch (error) {
            console.log(`   ❌ 오류: ${error.message}`);
        }

        console.log('');
    }

    console.log('📊 테스트 결과:');
    console.log(`   성공: ${passedTests}/${totalTests}`);
    console.log(`   실패: ${totalTests - passedTests}/${totalTests}`);

    if (passedTests === totalTests) {
        console.log('🎉 모든 테스트 통과!');
        return true;
    } else {
        console.log('⚠️ 일부 테스트 실패');
        return false;
    }
}

/**
 * 중복 암호화 방지 테스트
 */
function testDoubleEncryption() {
    console.log('\n🔄 중복 암호화 방지 테스트');
    
    const originalData = '010-1234-5678';
    
    // 첫 번째 암호화
    const firstEncryption = encrypt(originalData);
    console.log(`첫 번째 암호화: ${firstEncryption}`);
    
    // 두 번째 암호화 (이미 암호화된 데이터를 다시 암호화)
    const secondEncryption = encrypt(firstEncryption);
    console.log(`두 번째 암호화: ${secondEncryption}`);
    
    // 중복 암호화 방지 확인
    if (firstEncryption === secondEncryption) {
        console.log('✅ 중복 암호화 방지 성공');
        return true;
    } else {
        console.log('❌ 중복 암호화 방지 실패');
        return false;
    }
}

/**
 * 성능 테스트
 */
function testPerformance() {
    console.log('\n⚡ 성능 테스트');
    
    const testData = Array.from({ length: 1000 }, (_, i) => `테스트 데이터 ${i}`);
    
    // 암호화 성능 테스트
    const encryptStart = Date.now();
    const encrypted = testData.map(data => encrypt(data));
    const encryptTime = Date.now() - encryptStart;
    
    // 복호화 성능 테스트
    const decryptStart = Date.now();
    const decrypted = encrypted.map(data => decrypt(data));
    const decryptTime = Date.now() - decryptStart;
    
    console.log(`📊 1000개 데이터 처리 시간:`);
    console.log(`   암호화: ${encryptTime}ms`);
    console.log(`   복호화: ${decryptTime}ms`);
    console.log(`   평균 암호화: ${(encryptTime / 1000).toFixed(2)}ms/개`);
    console.log(`   평균 복호화: ${(decryptTime / 1000).toFixed(2)}ms/개`);
    
    // 정확성 확인
    const accuracy = testData.every((original, index) => original === decrypted[index]);
    console.log(`   정확성: ${accuracy ? '100%' : '실패'}`);
    
    return accuracy;
}

/**
 * 모든 테스트 실행
 */
function runAllTests() {
    console.log('🚀 LOCO 암호화 시스템 전체 테스트\n');
    
    const results = [
        testEncryption(),
        testDoubleEncryption(),
        testPerformance()
    ];
    
    const passedCount = results.filter(result => result).length;
    
    console.log('\n📋 전체 테스트 결과:');
    console.log(`성공한 테스트: ${passedCount}/${results.length}`);
    
    if (passedCount === results.length) {
        console.log('🎉 모든 테스트 통과! 암호화 시스템이 정상적으로 작동합니다.');
        console.log('✅ 이제 npm run encrypt-data 명령으로 기존 데이터를 암호화할 수 있습니다.');
    } else {
        console.log('⚠️ 일부 테스트가 실패했습니다. 설정을 확인해주세요.');
    }
}

// 스크립트 실행
runAllTests();
