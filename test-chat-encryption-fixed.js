// 채팅 암호화 테스트 스크립트
import ChatEncryption from './src/utils/encryption/chatEncryption.js';
import dotenv from 'dotenv';

// 환경변수 로드
dotenv.config();

console.log('🧪 채팅 암호화 시스템 테스트 시작...');

try {
    // 테스트 메시지
    const testMessage = '안녕하세요! Hello World! 123 테스트 메시지입니다.';
    
    console.log(`📝 원본 메시지: "${testMessage}"`);
    
    // 1. 암호화 테스트
    console.log('\n🔐 암호화 중...');
    const encrypted = ChatEncryption.encryptMessage(testMessage);
    
    console.log('✅ 암호화 성공!');
    console.log(`  - encryptedText: ${encrypted.encryptedText.substring(0, 50)}...`);
    console.log(`  - iv: ${encrypted.iv}`);
    console.log(`  - tag: ${encrypted.tag}`);
    
    // 2. 복호화 테스트
    console.log('\n🔓 복호화 중...');
    const decrypted = ChatEncryption.decryptMessage(encrypted);
    
    console.log(`✅ 복호화 성공: "${decrypted}"`);
    
    // 3. 결과 검증
    const isSuccess = decrypted === testMessage;
    console.log(`\n🎯 테스트 결과: ${isSuccess ? '✅ 성공' : '❌ 실패'}`);
    
    if (!isSuccess) {
        console.log(`❌ 원본: "${testMessage}"`);
        console.log(`❌ 복호화: "${decrypted}"`);
    }
    
    // 4. 성능 테스트
    console.log('\n⚡ 성능 테스트 실행...');
    const performanceResult = ChatEncryption.performanceTest(testMessage);
    
    console.log('\n🏆 최종 결과:');
    console.log(`  - 암호화/복호화: ${performanceResult.success ? '✅ 성공' : '❌ 실패'}`);
    console.log(`  - 암호화 시간: ${performanceResult.encryptTime}ms`);
    console.log(`  - 복호화 시간: ${performanceResult.decryptTime}ms`);
    console.log(`  - 총 소요시간: ${performanceResult.totalTime}ms`);
    console.log(`  - 추출된 키워드 수: ${performanceResult.keywords?.length || 0}개`);
    
} catch (error) {
    console.error('❌ 테스트 실패:', error.message);
    console.error('스택 트레이스:', error.stack);
    process.exit(1);
}
