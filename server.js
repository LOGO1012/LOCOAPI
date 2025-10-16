// server.js - KMS 사용 버전
import dotenv from 'dotenv';

// 🔧 환경변수를 가장 먼저 로드
dotenv.config({ path: './.env' });

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cookieParser from "cookie-parser";

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
import mongoose from "mongoose";
import {startResetStarScheduler} from "./src/scheduler/resetStarScheduler.js";

// 환경변수 로딩 확인
console.log('🔧 환경변수 로딩 상태:');
console.log('ENABLE_KMS:', process.env.ENABLE_KMS || 'undefined');
console.log('ENABLE_ENCRYPTION:', process.env.ENABLE_ENCRYPTION || 'undefined');
console.log('AWS_REGION:', process.env.AWS_REGION || 'undefined');
console.log('KMS_KEY_ID:', process.env.KMS_KEY_ID || 'undefined');
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'AKIA...' + process.env.AWS_ACCESS_KEY_ID.slice(-4) : 'undefined');
console.log('NODE_ENV:', process.env.NODE_ENV || 'undefined');
console.log('');



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

// 미들웨어 설정
app.use(cors({
    origin: [process.env.FRONTEND_URL || "http://localhost:5173",
        "http://192.168.219.104:5173"],
    credentials: true,
}));
app.use(cookieParser()); // 쿠키 파서를 추가

// 미들웨어 추가: res.cookie() 호출 시 로그 출력
app.use((req, res, next) => {
    const originalCookie = res.cookie;
    const originalClearCookie = res.clearCookie;
    
    res.cookie = function(name, value, options) {
        console.log(`Setting cookie: ${name}`, value, options);
        return originalCookie.call(this, name, value, options);
    }
    
    res.clearCookie = function(name, options) {
        console.log(`Clearing cookie: ${name}`, options);
        return originalClearCookie.call(this, name, options);
    }
    
    next();
});

app.use(express.json());


app.use(session({
    secret: process.env.SESSION_SECRET || 'your_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true
    }
}));

// 정적 파일 제공 (예: uploads 폴더)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// 디버깅용: 업로드된 파일 목록 확인 라우트
app.get('/api/debug/uploads', (req, res) => {
    try {
        const uploadPath = path.join(process.cwd(), 'uploads', 'banners');
        
        if (!fs.existsSync(uploadPath)) {
            return res.json({ 
                success: false, 
                message: 'uploads/banners 폴더가 존재하지 않습니다',
                path: uploadPath 
            });
        }
        
        const files = fs.readdirSync(uploadPath);
        res.json({
            success: true,
            uploadPath: uploadPath,
            files: files,
            fileCount: files.length
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 디버깅용: 에디터 이미지 파일 목록 확인
app.get('/api/debug/editor-uploads', (req, res) => {
    try {
        const editorPath = path.join(process.cwd(), 'uploads', 'news', 'editor');
        
        if (!fs.existsSync(editorPath)) {
            return res.json({ 
                success: false, 
                message: 'uploads/news/editor 폴더가 존재하지 않습니다',
                path: editorPath 
            });
        }
        
        const files = fs.readdirSync(editorPath);
        const fileDetails = files.map(file => {
            const filePath = path.join(editorPath, file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                size: stats.size,
                created: stats.birthtime,
                url: `/uploads/news/editor/${file}`
            };
        });
        
        res.json({
            success: true,
            editorPath: editorPath,
            files: fileDetails,
            fileCount: files.length
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

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

// HTTP 서버 생성 및 Socket.IO 초기화
const server = http.createServer(app);
const io = initializeSocket(server);

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
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 📅 5단계: 스케줄러 시작 (MongoDB 연결 완료 후)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        console.log('📅 5단계: 스케줄러 시작 중...');
        startResetStarScheduler();
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