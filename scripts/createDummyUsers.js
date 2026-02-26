import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/UserProfile.js';

dotenv.config({ path: './.env' });

const dummyNicknames = [
    '행복한나무', '졸린고양이', '빠른거북이', '푸른하늘', '빛나는별',
    '산들바람', '맛있는사과', '씩씩한사자', '지혜로운부엉이', '노래하는새'
];

const createDummyUsers = async () => {
    try {
        console.log('🔄 MongoDB 연결 중...');
        // .env의 MONGO_URI 사용
        const mongoUri = process.env.MONGO_URI || 'mongodb://loco:loco98@localhost/locodb';
        await mongoose.connect(mongoUri);
        console.log('✅ MongoDB 연결 완료');

        for (const nickname of dummyNicknames) {
            // 중복 체크
            const exists = await User.findOne({ nickname });
            if (exists) {
                console.log(`⚠️ 이미 존재하는 닉네임: ${nickname}`);
                continue;
            }

            const newUser = new User({
                nickname,
                userLv: 1,
                status: 'active',
                numOfChat: Math.floor(Math.random() * 50),
                lastLogin: new Date(Date.now() - Math.floor(Math.random() * 10 * 24 * 60 * 60 * 1000)),
                identityVerified: true,
                policy: true
            });

            await newUser.save();
            console.log(`👤 사용자 생성 완료: ${nickname}`);
        }

        console.log('✨ 모든 더미 데이터 생성이 완료되었습니다!');
    } catch (error) {
        console.error('❌ 더미 데이터 생성 중 오류 발생:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 MongoDB 연결 종료');
    }
};

createDummyUsers();
