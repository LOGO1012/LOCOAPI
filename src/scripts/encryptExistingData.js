// src/scripts/encryptExistingData.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/UserProfile.js';
import { ChatMessage } from '../models/chat.js';
import { encrypt, isEncrypted } from '../utils/encryption.js';

dotenv.config();

/**
 * 기존 사용자 데이터 암호화 마이그레이션
 */
async function migrateUserData() {
    console.log('🔄 사용자 데이터 암호화 시작...');
    
    try {
        // 모든 사용자 조회 (Mongoose getter는 비활성화하여 원본 데이터 조회)
        const users = await User.find({}).lean();
        let processedCount = 0;
        let encryptedCount = 0;

        for (const user of users) {
            let needsUpdate = false;
            const updateData = {};

            // name 필드 암호화
            if (user.name && !isEncrypted(user.name)) {
                updateData.name = encrypt(user.name);
                needsUpdate = true;
            }

            // phone 필드 암호화
            if (user.phone && !isEncrypted(user.phone)) {
                updateData.phone = encrypt(user.phone);
                needsUpdate = true;
            }

            // birthdate 필드 암호화
            if (user.birthdate && !isEncrypted(user.birthdate)) {
                updateData.birthdate = encrypt(user.birthdate);
                needsUpdate = true;
            }

            // 소셜 로그인 정보 암호화
            if (user.social) {
                // 카카오 정보
                if (user.social.kakao) {
                    if (user.social.kakao.name && !isEncrypted(user.social.kakao.name)) {
                        updateData['social.kakao.name'] = encrypt(user.social.kakao.name);
                        needsUpdate = true;
                    }
                    if (user.social.kakao.phoneNumber && !isEncrypted(user.social.kakao.phoneNumber)) {
                        updateData['social.kakao.phoneNumber'] = encrypt(user.social.kakao.phoneNumber);
                        needsUpdate = true;
                    }
                }

                // 네이버 정보
                if (user.social.naver) {
                    if (user.social.naver.name && !isEncrypted(user.social.naver.name)) {
                        updateData['social.naver.name'] = encrypt(user.social.naver.name);
                        needsUpdate = true;
                    }
                    if (user.social.naver.phoneNumber && !isEncrypted(user.social.naver.phoneNumber)) {
                        updateData['social.naver.phoneNumber'] = encrypt(user.social.naver.phoneNumber);
                        needsUpdate = true;
                    }
                }
            }

            // 업데이트가 필요한 경우만 실행
            if (needsUpdate) {
                await User.updateOne({ _id: user._id }, { $set: updateData });
                encryptedCount++;
                console.log(`✅ 사용자 ${user.nickname || user._id} 암호화 완료`);
            }

            processedCount++;
            
            // 진행상황 표시
            if (processedCount % 100 === 0) {
                console.log(`📊 진행상황: ${processedCount}명 처리됨 (${encryptedCount}명 암호화됨)`);
            }
        }

        console.log(`✅ 사용자 데이터 암호화 완료: ${processedCount}명 처리, ${encryptedCount}명 암호화됨`);
    } catch (error) {
        console.error('❌ 사용자 데이터 암호화 오류:', error);
        throw error;
    }
}

/**
 * 기존 채팅 메시지 데이터 암호화 마이그레이션
 */
async function migrateChatData() {
    console.log('🔄 채팅 메시지 암호화 시작...');
    
    try {
        // 배치 크기 설정 (메모리 효율성을 위해)
        const batchSize = 1000;
        let skip = 0;
        let totalProcessed = 0;
        let totalEncrypted = 0;

        while (true) {
            // 배치 단위로 메시지 조회
            const messages = await ChatMessage.find({}).lean().skip(skip).limit(batchSize);
            
            if (messages.length === 0) {
                break; // 더 이상 처리할 메시지가 없음
            }

            let batchEncrypted = 0;

            for (const message of messages) {
                // 이미 암호화된 메시지는 스킵
                if (message.text && !isEncrypted(message.text)) {
                    await ChatMessage.updateOne(
                        { _id: message._id },
                        { $set: { text: encrypt(message.text) } }
                    );
                    batchEncrypted++;
                }
            }

            totalProcessed += messages.length;
            totalEncrypted += batchEncrypted;
            skip += batchSize;

            console.log(`📊 채팅 진행상황: ${totalProcessed}개 처리됨 (${totalEncrypted}개 암호화됨)`);
        }

        console.log(`✅ 채팅 메시지 암호화 완료: ${totalProcessed}개 처리, ${totalEncrypted}개 암호화됨`);
    } catch (error) {
        console.error('❌ 채팅 메시지 암호화 오류:', error);
        throw error;
    }
}

/**
 * 암호화 상태 확인
 */
async function checkEncryptionStatus() {
    console.log('🔍 암호화 상태 확인 중...');
    
    try {
        // 사용자 데이터 확인
        const totalUsers = await User.countDocuments();
        const usersWithEncryptedPhone = await User.countDocuments({
            phone: { $regex: /^[a-f0-9]{32}:/ }
        });
        const usersWithEncryptedName = await User.countDocuments({
            name: { $regex: /^[a-f0-9]{32}:/ }
        });
        
        // 채팅 메시지 확인
        const totalMessages = await ChatMessage.countDocuments();
        const encryptedMessages = await ChatMessage.countDocuments({
            text: { $regex: /^[a-f0-9]{32}:/ }
        });

        console.log('📊 암호화 상태 보고서:');
        console.log(`👥 사용자: ${totalUsers}명 중`);
        console.log(`   - 전화번호 암호화: ${usersWithEncryptedPhone}명`);
        console.log(`   - 이름 암호화: ${usersWithEncryptedName}명`);
        console.log(`💬 채팅 메시지: ${totalMessages}개 중 ${encryptedMessages}개 암호화됨`);
    } catch (error) {
        console.error('❌ 암호화 상태 확인 오류:', error);
    }
}

/**
 * 메인 마이그레이션 실행
 */
async function runMigration() {
    try {
        console.log('🚀 개인정보 암호화 마이그레이션 시작');
        console.log('📅 시작 시간:', new Date().toLocaleString());
        
        // MongoDB 연결
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ MongoDB 연결 성공');

        // 마이그레이션 전 상태 확인
        console.log('\n=== 마이그레이션 전 상태 ===');
        await checkEncryptionStatus();

        // 사용자 데이터 암호화
        console.log('\n=== 사용자 데이터 암호화 ===');
        await migrateUserData();

        // 채팅 메시지 암호화
        console.log('\n=== 채팅 메시지 암호화 ===');
        await migrateChatData();

        // 마이그레이션 후 상태 확인
        console.log('\n=== 마이그레이션 후 상태 ===');
        await checkEncryptionStatus();

        console.log('\n🎉 암호화 마이그레이션 완료!');
        console.log('📅 완료 시간:', new Date().toLocaleString());
        
    } catch (error) {
        console.error('💥 마이그레이션 실패:', error);
        process.exit(1);
    } finally {
        // MongoDB 연결 종료
        await mongoose.disconnect();
        console.log('👋 MongoDB 연결 종료');
        process.exit(0);
    }
}

// 스크립트 실행
if (import.meta.url === `file://${process.argv[1]}`) {
    runMigration();
}

export { migrateUserData, migrateChatData, checkEncryptionStatus };
