// server.js - KMS 사용 버전
import dotenv from 'dotenv';
import ChatEncryption from './src/utils/encryption/chatEncryption.js';

// 🔧 환경변수를 가장 먼저 로드
dotenv.config({ path: './.env' });

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import http from 'http';
import path from 'path';
import cookieParser from "cookie-parser";
import redisClient from './src/config/redis.js';

// 환경변수 로드 후 모듈 import
import developerRoutes from './src/routes/developerRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';
import authRoutes from './src/routes/authRoutes.js';
import userRoutes from './src/routes/userRoutes.js';
import chatRoutes from './src/routes/chatRoutes.js';
import communityRoutes from './src/routes/communityRoutes.js';
import { initializeSocket } from './src/socket/socketIO.js';
import connectMongoDB from './src/config/mongoDB.js';
import qnaRoutes from "./src/routes/qnaRoutes.js";
import uploadRoutes from './src/routes/uploadRoutes.js';
import reportRoutes from "./src/routes/reportRoutes.js";
import reportNotificationRoutes from "./src/routes/reportNotificationRoutes.js";
import prRoutes from "./src/routes/prRoutes.js";
import onlineStatusRoutes from './src/routes/onlineStatusRoutes.js';
import newsRoutes from './src/routes/newsRoutes.js';
import editorRoutes from './src/routes/editorRoutes.js';
import bannerRoutes from './src/routes/bannerRoutes.js';
import profanityRoutes from './src/routes/profanityRoutes.js'; // 비속어 관리 라우트 추가
import termRoutes from './src/routes/termRoutes.js'; // 약관 관리 라우트 추가
import riotRoutes from './src/routes/riotRoutes.js'; // 라이엇 전적 조회 라우트 추가
import identityRoutes from './src/routes/identityRoutes.js'; // 포트원 본인인증 라우트 추가
import compression from "compression";
import { globalErrorHandler } from './src/utils/errors/errorHandler.js';
import mongoose from "mongoose";
import {startResetStarScheduler} from "./src/scheduler/resetStarScheduler.js";
import {startUserArchiveScheduler} from "./src/scheduler/userArchiveScheduler.js";
import { startAccessLogCleanup } from './src/scheduler/cleanupAccessLogs.js';
import { initMatchCleanupScheduler } from './src/scheduler/matchCleanupScheduler.js'; // 매치 정리 스케줄러 추가


// ✅ 서버 시작 시 초기화
ChatEncryption.initializeKey();

// 필수 환경변수 시작 시 검증
const REQUIRED_ENV = ['JWT_SECRET', 'REFRESH_SECRET', 'SESSION_SECRET', 'MONGO_URI'];
const missingEnv = REQUIRED_ENV.filter(key => !process.env[key]);

if (missingEnv.length > 0) {
    console.error(`❌ 필수 환경변수 누락: ${missingEnv.join(', ')}`);
    console.error('서버를 시작할 수 없습니다. .env 파일을 확인하세요.');
    process.exit(1);
}

// KMS 활성화 시 AWS 환경변수 추가 검증
if (process.env.ENABLE_KMS === 'true') {
    const KMS_REQUIRED_ENV = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'KMS_KEY_ID'];
    const missingKms = KMS_REQUIRED_ENV.filter(key => !process.env[key]);
    if (missingKms.length > 0) {
        console.error(`❌ KMS 환경변수 누락: ${missingKms.join(', ')}`);
        console.error('ENABLE_KMS=true 설정 시 AWS 인증 정보가 필요합니다.');
        process.exit(1);
    }
}

console.log('✅ 환경변수 검증 완료 (NODE_ENV:', process.env.NODE_ENV || 'development', ')');



// 🔧 IntelligentCache 초기화를 더 안정적으로 수정
const initializeIntelligentCache = async () => {
    try {
        console.log('🔄 IntelligentCache 초기화 시도...');
        const { default: IntelligentCache } = await import('./src/utils/cache/intelligentCache.js');
        
        const connectionType = await IntelligentCache.forceRedisConnection();
        console.log(`✅ IntelligentCache 초기화 완료: ${connectionType} 사용`);
        return true;
    } catch (error) {
        console.error('❌ IntelligentCache 초기화 실패:', error.message);
        console.log('📝 메모리 캐시로 폴백하여 계속 진행합니다.');
        return false;
    }
};

const app = express();

// M-16 보안 조치: Cloudflare/프록시 뒤에서 실제 클라이언트 IP 파악
app.set('trust proxy', 1);

// 미들웨어 설정
app.use(compression()); // gzip 응답 압축
app.use(cors({
    origin: [
        process.env.FRONTEND_URL || "http://localhost:5173",
        process.env.FRONTEND_URL_ALT
    ].filter(Boolean),
    credentials: true,
}));
app.use(cookieParser()); // 쿠키 파서를 추가

app.use(express.json({ limit: '1mb' }));


app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 30 * 60 * 1000  // 30분
    }
}));

// 정적 파일 제공 (예: uploads 폴더)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// 라우터 등록
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/qna', qnaRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/reportNotification', reportNotificationRoutes)
app.use('/api/upload', uploadRoutes);
app.use("/api/pr", prRoutes);
app.use('/api/developer', developerRoutes);
app.use('/api/profanity', profanityRoutes); // 비속어 관리 라우트 추가
app.use('/api/online-status', onlineStatusRoutes);


app.use('/api/news', newsRoutes);
app.use('/api/editor', editorRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/terms', termRoutes); // 약관 관리
app.use('/api/riot', riotRoutes); // 라이엇 전적 조회
app.use('/api/identity', identityRoutes); // 포트원 본인인증

// ✅ 구독 상품 목록 조회 API (DetailPanel.jsx에서 사용)
app.get('/api/product/names', (req, res) => {
    res.json([
        { _id: 'plan_basic', productName: 'Basic Plan' },
        { _id: 'plan_standard', productName: 'Standard Plan' },
        { _id: 'plan_premium', productName: 'Premium Plan' },
        { _id: 'plan_vip', productName: 'VIP Plan' }
    ]);
});

// H-14 보안 조치: 전역 에러 핸들러 등록 (모든 라우트 뒤에 위치해야 함)
app.use(globalErrorHandler);

// HTTP 서버 생성 및 Socket.IO 초기화
const server = http.createServer(app);
// const io = initializeSocket(server);

// 포트 설정 및 서버 실행
const PORT = process.env.PORT || 3000;




// ============================================================================
// 🚀 서버 시작 함수 (초기화 순서 보장)
// ============================================================================
const startServer = async () => {
    try {
        console.log('\n🏁 ========== 서버 초기화 시작 ==========');

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 📦 1단계: MongoDB 연결 (완료될 때까지 대기)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        console.log('📊 1단계: MongoDB 연결 중...');
        await connectMongoDB();  // ✅ await로 연결 완료 대기
        console.log('✅ MongoDB 연결 완료\n');

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 💾 2단계: 캐시 시스템 초기화 (완료될 때까지 대기)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        console.log('💾 2단계: 캐시 시스템 초기화 중...');
        const cacheInitialized = await initializeIntelligentCache();
        if (cacheInitialized) {
            console.log('✅ 캐시 시스템 초기화 완료\n');
        } else {
            console.log('⚠️ 캐시 초기화 실패, 메모리 캐시로 폴백\n');
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🔐 3단계: KMS 암호화 시스템 테스트 (선택적)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        console.log('🔐 3단계: KMS 암호화 시스템 테스트 중...');
        try {
            if (process.env.ENABLE_KMS === 'true') {
                const { default: comprehensiveEncryption } = await import('./src/utils/encryption/comprehensiveEncryption.js');
                const testResult = await comprehensiveEncryption.testKMSConnection();

                if (testResult) {
                    console.log('✅ KMS 암호화 시스템 정상 작동\n');
                } else {
                    console.log('⚠️ KMS 연결 실패, AES 폴백 모드로 작동\n');
                }
            } else {
                console.log('ℹ️ KMS 비활성화, AES 암호화 사용\n');
            }
        } catch (error) {
            console.error('❌ KMS 테스트 실패:', error.message);
            console.log('⚠️ AES 폴백 모드로 계속 진행\n');
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🆕 3.5단계: Socket.IO 초기화 (HTTP 서버 시작 전)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        console.log('🔌 3.5단계: Socket.IO 초기화 중...');
        await initializeSocket(server);  // ✅ await 추가!
        console.log('✅ Socket.IO 초기화 완료\n');

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🎯 4단계: HTTP 서버 시작
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        console.log('🎯 4단계: HTTP 서버 시작 중...');
        server.listen(PORT, () => {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`🎉 서버가 정상적으로 시작되었습니다!`);
            console.log(`🌐 URL: http://localhost:${PORT}`);
            console.log(`📊 MongoDB: 연결됨`);
            console.log(`💾 캐시: ${cacheInitialized ? 'Redis' : 'Memory'}`);
            console.log(`🔐 암호화: ${process.env.ENABLE_KMS === 'true' ? 'KMS' : 'AES'}`);
            console.log(`🔗 Socket.IO: Cluster 모드 활성화`);  // ✅ 추가
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 📅 5단계: 스케줄러 시작 (MongoDB 연결 완료 후)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        console.log('📅 5단계: 스케줄러 시작 중...');
        startResetStarScheduler();
        startUserArchiveScheduler();
        startAccessLogCleanup();
        initMatchCleanupScheduler(); // 매치 정리 스케줄러 추가
        console.log('✅ 스케줄러 시작 완료\n');

    } catch (error) {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ❌ 초기화 실패 시 서버 종료
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ 서버 초기화 실패!');
        console.error('오류:', error.message);
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        process.exit(1);
    }
};

// ============================================================================
// 🚀 서버 시작 실행
// ============================================================================
startServer();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🛑 서버 종료 시 정리 작업
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
process.on('SIGINT', async () => {
    console.log('\n🛑 서버 종료 신호 받음...');

    // 캐시 정리 중지
    try {
        const { default: IntelligentCache } = await import('./src/utils/cache/intelligentCache.js');
        IntelligentCache.stopMemoryCleanup();
    } catch (error) {
        console.error('캐시 정리 중 오류:', error.message);
    }

    // MongoDB 연결 종료
    try {
        await mongoose.connection.close();
        console.log('✅ MongoDB 연결 종료');
    } catch (error) {
        console.error('MongoDB 종료 중 오류:', error.message);
    }

    // Socket.IO 연결 종료
    try {
        const { io } = await import('./src/socket/socketIO.js');
        if (io) {
            io.close();
            console.log('✅ Socket.IO 연결 종료');
        }
    } catch (error) {
        console.error('Socket.IO 종료 중 오류:', error.message);
    }

    // HTTP 서버 종료
    server.close(() => {
        console.log('✅ 서버 종료 완료');
        process.exit(0);
    });
});

//
// mongoose.connection.once('open', () => {
//     console.log('MongoDB connected – starting schedulers');
//     startResetStarScheduler();
// });