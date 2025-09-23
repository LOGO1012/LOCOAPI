// 채팅 암호화 및 복호화 테스트
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// 환경변수 로드
dotenv.config();

// MongoDB 연결
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/myDatabase';

console.log('🔗 MongoDB 연결 중...');
await mongoose.connect(MONGO_URI);
console.log('✅ MongoDB 연결 성공');

// 채팅 서비스 import
import * as chatService from './src/services/chatService.js';

console.log('\n🧪 채팅 암호화 시스템 테스트 시작...');

try {
    // 1. 암호화 시스템 테스트
    console.log('\n1️⃣ 암호화 시스템 성능 테스트...');
    const testResult = await chatService.testChatEncryption();
    
    if (testResult.success) {
        console.log('✅ 암호화 시스템 테스트 성공!');
        console.log(`  - 암호화 시간: ${testResult.encryptionTest.encryptTime}ms`);
        console.log(`  - 복호화 시간: ${testResult.encryptionTest.decryptTime}ms`);
        console.log(`  - 추출된 키워드: ${testResult.keywordCount}개`);
    } else {
        console.error('❌ 암호화 시스템 테스트 실패:', testResult.error);
    }

    // 2. 실제 메시지 저장 및 조회 테스트
    console.log('\n2️⃣ 실제 메시지 저장/조회 테스트...');
    
    // 더미 데이터 (실제 ObjectId 형식)
    const testRoomId = new mongoose.Types.ObjectId();
    const testUserId = new mongoose.Types.ObjectId();
    const testMessage = '안녕하세요! 이것은 암호화 테스트 메시지입니다. Hello World! 123';
    
    console.log(`📝 테스트 메시지 저장: "${testMessage}"`);
    
    // 메시지 저장 (암호화)
    const savedMessage = await chatService.saveMessage(testRoomId, testUserId, testMessage, {
        platform: 'test',
        userAgent: 'test-script'
    });
    
    console.log(`💾 메시지 저장 완료: ${savedMessage._id}`);
    console.log(`🔐 암호화 여부: ${savedMessage.isEncrypted}`);
    
    if (savedMessage.isEncrypted) {
        console.log(`🔒 암호화된 텍스트 길이: ${savedMessage.encryptedText?.length || 0}자`);
        console.log(`🗝️ 키워드 해시 개수: ${savedMessage.keywords?.length || 0}개`);
    }
    
    // 3. 메시지 조회 테스트 (자동 복호화)
    console.log('\n3️⃣ 메시지 조회 테스트 (사용자용 - 자동 복호화)...');
    
    // 우선 채팅방을 생성해야 함
    const testRoom = await chatService.createChatRoom('random', 2, 'any', 'adult');
    await chatService.addUserToRoom(testRoom._id, testUserId);
    
    // 메시지를 해당 방에 저장
    const roomMessage = await chatService.saveMessage(testRoom._id, testUserId, testMessage);
    console.log(`📨 방 메시지 저장: ${roomMessage._id}`);
    
    // 메시지 조회 (복호화)
    const messagesResult = await chatService.getMessagesByRoom(testRoom._id, false, 1, 20, testUserId);
    
    console.log(`📋 조회된 메시지 수: ${messagesResult.messages.length}개`);
    
    if (messagesResult.messages.length > 0) {
        const firstMessage = messagesResult.messages[0];
        console.log(`🔓 복호화된 메시지: "${firstMessage.text}"`);
        console.log(`✅ 원본과 일치: ${firstMessage.text === testMessage}`);
        console.log(`🔐 클라이언트 암호화 상태: ${firstMessage.isEncrypted}`);
        
        // 암호화 관련 필드가 제거되었는지 확인
        console.log(`🧹 암호화 필드 제거 확인:`);
        console.log(`  - encryptedText: ${firstMessage.encryptedText ? '❌ 존재' : '✅ 제거됨'}`);
        console.log(`  - iv: ${firstMessage.iv ? '❌ 존재' : '✅ 제거됨'}`);
        console.log(`  - tag: ${firstMessage.tag ? '❌ 존재' : '✅ 제거됨'}`);
        console.log(`  - keywords: ${firstMessage.keywords ? '❌ 존재' : '✅ 제거됨'}`);
    }
    
    // 4. 관리자용 조회 테스트 (암호화 상태 유지)
    console.log('\n4️⃣ 관리자용 메시지 조회 테스트 (암호화 상태 유지)...');
    
    const adminResult = await chatService.getMessagesByRoomForAdmin(testRoom._id);
    
    if (adminResult.messages.length > 0) {
        const adminMessage = adminResult.messages[0];
        console.log(`🔧 관리자용 메시지 조회 완료`);
        console.log(`🔐 암호화 상태: ${adminMessage.isEncrypted}`);
        
        if (adminMessage.isEncrypted) {
            console.log(`🔒 암호화된 텍스트 존재: ${!!adminMessage.encryptedText}`);
            console.log(`🗝️ IV 존재: ${!!adminMessage.iv}`);
            console.log(`🏷️ Tag 존재: ${!!adminMessage.tag}`);
            console.log(`📇 키워드 해시 존재: ${!!adminMessage.keywords}`);
        }
    }
    
    console.log('\n🎉 모든 테스트 완료!');
    
    // 정리
    console.log('\n🧹 테스트 데이터 정리 중...');
    await mongoose.connection.db.collection('chatrooms').deleteOne({ _id: testRoom._id });
    await mongoose.connection.db.collection('chatmessages').deleteMany({ chatRoom: { $in: [testRoomId, testRoom._id] } });
    console.log('✅ 테스트 데이터 정리 완료');
    
} catch (error) {
    console.error('❌ 테스트 실패:', error);
} finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB 연결 종료');
}
