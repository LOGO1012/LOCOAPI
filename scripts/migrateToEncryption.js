// scripts/migrateToEncryption.js
import mongoose from 'mongoose';
import { User } from '../src/models/UserProfile.js';
import ComprehensiveEncryption from '../src/utils/encryption/comprehensiveEncryption.js';
import IntelligentCache from '../src/utils/cache/intelligentCache.js';
import dotenv from 'dotenv';

dotenv.config();

const migrateToEncryption = async () => {
    try {
        console.log('🔄 암호화 마이그레이션 시작...');
        
        // MongoDB 연결
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB 연결 성공');

        // 1단계: 평문 데이터가 있는 사용자 조회
        const usersToMigrate = await User.find({
            $or: [
                { name: { $exists: true, $ne: "", $not: /^U2FsdGVk/ } },
                { phone: { $exists: true, $ne: "", $not: /^U2FsdGVk/ } },
                { birthdate: { $exists: true, $ne: "", $not: /^U2FsdGVk/ } }
            ]
        });

        console.log(`📊 마이그레이션 대상 사용자 수: ${usersToMigrate.length}`);

        let migratedCount = 0;
        let errorCount = 0;

        for (const user of usersToMigrate) {
            try {
                const updateData = {};
                let needsUpdate = false;

                // 이름 암호화
                if (user.name && !user.name.startsWith('U2FsdGVk')) {
                    updateData.name = ComprehensiveEncryption.encryptPersonalInfo(user.name);
                    updateData.name_hash = ComprehensiveEncryption.createSearchHash(user.name);
                    needsUpdate = true;
                }

                // 전화번호 암호화
                if (user.phone && !user.phone.startsWith('U2FsdGVk')) {
                    updateData.phone = ComprehensiveEncryption.encryptPersonalInfo(user.phone);
                    updateData.phone_hash = ComprehensiveEncryption.createPhoneHash(user.phone);
                    needsUpdate = true;
                }

                // 생년월일 암호화
                if (user.birthdate && !user.birthdate.startsWith('U2FsdGVk')) {
                    updateData.birthdate = ComprehensiveEncryption.encryptPersonalInfo(user.birthdate);
                    updateData.birthdate_hash = ComprehensiveEncryption.createSearchHash(user.birthdate);
                    needsUpdate = true;

                    // 나이 캐시 생성
                    try {
                        const age = ComprehensiveEncryption.calculateAge(user.birthdate);
                        const ageGroup = ComprehensiveEncryption.getAgeGroup(user.birthdate);
                        const isMinor = ComprehensiveEncryption.isMinor(user.birthdate);
                        
                        await IntelligentCache.cacheUserAge(user._id, age, ageGroup, isMinor);
                    } catch (ageError) {
                        console.warn(`⚠️ 나이 캐시 생성 실패 (${user._id}):`, ageError.message);
                    }
                }

                // 소셜 정보 암호화
                if (user.social) {
                    if (user.social.kakao) {
                        const kakao = user.social.kakao;
                        const encryptedKakao = { ...kakao };

                        if (kakao.name && !kakao.name.startsWith('U2FsdGVk')) {
                            encryptedKakao.name = ComprehensiveEncryption.encryptPersonalInfo(kakao.name);
                            needsUpdate = true;
                        }
                        if (kakao.phoneNumber && !kakao.phoneNumber.startsWith('U2FsdGVk')) {
                            encryptedKakao.phoneNumber = ComprehensiveEncryption.encryptPersonalInfo(kakao.phoneNumber);
                            needsUpdate = true;
                        }
                        if (kakao.birthday && !kakao.birthday.toString().startsWith('U2FsdGVk')) {
                            encryptedKakao.birthday = ComprehensiveEncryption.encryptPersonalInfo(kakao.birthday.toString());
                            needsUpdate = true;
                        }
                        if (kakao.birthyear && !kakao.birthyear.toString().startsWith('U2FsdGVk')) {
                            encryptedKakao.birthyear = ComprehensiveEncryption.encryptPersonalInfo(kakao.birthyear.toString());
                            needsUpdate = true;
                        }
                        if (kakao.providerId && !kakao.providerId_hash) {
                            encryptedKakao.providerId_hash = ComprehensiveEncryption.hashProviderId(kakao.providerId);
                            needsUpdate = true;
                        }

                        if (needsUpdate) {
                            updateData['social.kakao'] = encryptedKakao;
                        }
                    }

                    if (user.social.naver) {
                        const naver = user.social.naver;
                        const encryptedNaver = { ...naver };

                        if (naver.name && !naver.name.startsWith('U2FsdGVk')) {
                            encryptedNaver.name = ComprehensiveEncryption.encryptPersonalInfo(naver.name);
                            needsUpdate = true;
                        }
                        if (naver.phoneNumber && !naver.phoneNumber.startsWith('U2FsdGVk')) {
                            encryptedNaver.phoneNumber = ComprehensiveEncryption.encryptPersonalInfo(naver.phoneNumber);
                            needsUpdate = true;
                        }
                        if (naver.birthday && !naver.birthday.startsWith('U2FsdGVk')) {
                            encryptedNaver.birthday = ComprehensiveEncryption.encryptPersonalInfo(naver.birthday);
                            needsUpdate = true;
                        }
                        if (naver.birthyear && !naver.birthyear.toString().startsWith('U2FsdGVk')) {
                            encryptedNaver.birthyear = ComprehensiveEncryption.encryptPersonalInfo(naver.birthyear.toString());
                            needsUpdate = true;
                        }
                        if (naver.providerId && !naver.providerId_hash) {
                            encryptedNaver.providerId_hash = ComprehensiveEncryption.hashProviderId(naver.providerId);
                            needsUpdate = true;
                        }

                        if (needsUpdate) {
                            updateData['social.naver'] = encryptedNaver;
                        }
                    }
                }

                if (needsUpdate) {
                    await User.findByIdAndUpdate(user._id, updateData);
                    migratedCount++;
                    
                    if (migratedCount % 100 === 0) {
                        console.log(`📈 ${migratedCount}명 마이그레이션 완료...`);
                    }
                }

            } catch (error) {
                console.error(`❌ 사용자 ${user._id} 마이그레이션 실패:`, error.message);
                errorCount++;
            }
        }

        console.log('\n🎉 마이그레이션 완료!');
        console.log(`✅ 성공: ${migratedCount}명`);
        console.log(`❌ 실패: ${errorCount}명`);
        console.log(`📊 총 처리: ${usersToMigrate.length}명`);

        // 🗑️ age 필드 완전 제거 (유저가 없으므로 바로 실행)
        console.log('\n🗑️ age 필드 완전 제거 시작...');
        
        const ageFieldUsers = await User.find({ 
            $or: [
                { age: { $exists: true } },
                { calculatedAge: { $exists: true } },
                { ageGroup: { $exists: true } },
                { isMinor: { $exists: true } }
            ]
        });
        console.log(`📊 나이 관련 필드가 있는 사용자: ${ageFieldUsers.length}명`);
        
        if (ageFieldUsers.length > 0) {
            const result = await User.updateMany(
                {},
                { 
                    $unset: { 
                        age: 1, 
                        calculatedAge: 1,
                        ageGroup: 1,
                        isMinor: 1,
                        ageCategory: 1
                    } 
                }
            );
            console.log(`✅ 모든 age 관련 필드 제거 완료: ${result.modifiedCount}명`);
        } else {
            console.log('✅ 제거할 age 필드가 없습니다.');
        }

        // 통계 출력
        const encryptedUsers = await User.countDocuments({
            name: { $regex: /^U2FsdGVk/ }
        });
        console.log(`🔐 현재 암호화된 사용자 수: ${encryptedUsers}명`);
        
        const birthdateUsers = await User.countDocuments({
            birthdate: { $exists: true, $ne: "" }
        });
        console.log(`📅 birthdate가 있는 사용자 수: ${birthdateUsers}명`);
        
        const ageFieldCount = await User.countDocuments({
            age: { $exists: true }
        });
        console.log(`📈 남은 age 필드 사용자 수: ${ageFieldCount}명`);

    } catch (error) {
        console.error('❌ 마이그레이션 실패:', error);
    } finally {
        await mongoose.connection.close();
        console.log('📋 MongoDB 연결 종료');
    }
};

// 스크립트 실행
migrateToEncryption();