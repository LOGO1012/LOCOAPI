// test-chat-encryption.js - 채팅 암호화 시스템 테스트 스크립트

import ChatEncryption from '../src/utils/encryption/chatEncryption.js';
import ComprehensiveEncryption from '../src/utils/encryption/comprehensiveEncryption.js';
import { testChatEncryption } from '../src/services/chatService.js';

console.log('🧪 LOCO 채팅 암호화 시스템 통합 테스트 시작...\n');

// 1. ChatEncryption 클래스 테스트
console.log('=== 1. ChatEncryption 클래스 테스트 ===');
try {
    const result = ChatEncryption.performanceTest('안녕하세요! Hello World! 123 테스트 메시지');
    
    if (result.success) {
        console.log('✅ ChatEncryption 테스트 성공!');
        console.log(`   - 암호화: ${result.encryptTime}ms`);
        console.log(`   - 복호화: ${result.decryptTime}ms`);
        console.log(`   - 키워드 추출: ${result.keywordTime}ms`);
        console.log(`   - 총 시간: ${result.totalTime}ms`);
    } else {
        console.log('❌ ChatEncryption 테스트 실패:', result.error);
    }
} catch (error) {
    console.log('❌ ChatEncryption 테스트 오류:', error.message);
}

console.log('\n=== 2. ComprehensiveEncryption 나이 계산 테스트 ===');

// 2. 기존 시스템의 나이 계산 테스트
try {
    console.log('나이 계산 테스트:');
    
    // 미성년자 테스트
    const minorBirthdate = '2006-03-15';
    const minorAge = ComprehensiveEncryption.calculateAge(minorBirthdate);
    const isMinor = ComprehensiveEncryption.isMinor(minorBirthdate);
    const minorGroup = ComprehensiveEncryption.getAgeGroup(minorBirthdate);
    
    console.log(`   미성년자 테스트 (${minorBirthdate}):`);
    console.log(`     - 나이: ${minorAge}세`);
    console.log(`     - 미성년자 여부: ${isMinor}`);
    console.log(`     - 연령 그룹: ${minorGroup}`);
    
    // 성인 테스트  
    const adultBirthdate = '1995-03-15';
    const adultAge = ComprehensiveEncryption.calculateAge(adultBirthdate);
    const isAdultMinor = ComprehensiveEncryption.isMinor(adultBirthdate);
    const adultGroup = ComprehensiveEncryption.getAgeGroup(adultBirthdate);
    
    console.log(`   성인 테스트 (${adultBirthdate}):`);
    console.log(`     - 나이: ${adultAge}세`);
    console.log(`     - 미성년자 여부: ${isAdultMinor}`);
    console.log(`     - 연령 그룹: ${adultGroup}`);
    
    console.log('✅ 나이 검증 테스트 완료');
} catch (error) {
    console.log('❌ 나이 검증 테스트 실패:', error.message);
}

console.log('\n=== 3. 환경변수 확인 ===');
console.log(`CHAT_ENCRYPTION_ENABLED: ${process.env.CHAT_ENCRYPTION_ENABLED}`);
console.log(`CHAT_SALT: ${process.env.CHAT_SALT ? '설정됨' : '미설정'}`);
console.log(`SEARCH_SALT: ${process.env.SEARCH_SALT ? '설정됨' : '미설정'}`);
console.log(`ENABLE_ENCRYPTION: ${process.env.ENABLE_ENCRYPTION}`);

console.log('\n🎉 모든 테스트 완료!');
console.log('\n다음 단계:');
console.log('1. node test-chat-encryption.js 실행하여 테스트');
console.log('2. chatService.js의 addUserToRoom에 나이 검증 추가 완료');
console.log('3. 프론트엔드에서 암호화된 메시지 저장 테스트');
