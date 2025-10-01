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

// MongoDB 연결 (실패/성공 메시지는 mongoDB.js에서 처리)
connectMongoDB();

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
server.listen(PORT, async () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    
    // 🔧 서버 시작 후 캐시 초기화 (비동기, 비차단)
    setTimeout(async () => {
        await initializeIntelligentCache();
        
        // 🧪 KMS 암호화 테스트 실행
        setTimeout(async () => {
            try {
                console.log('\n🧪 ========== KMS 암호화 시스템 테스트 시작 ==========');
                console.log('🔧 [DEBUG] testKMSConnection 함수 호출 전');
                console.log('🏗️ KMS 테스트 시작 - 환경 설정 확인...');
                console.log('🔧 KMS 활성화:', process.env.ENABLE_KMS === 'true');
                console.log('🌏 AWS 리전:', process.env.AWS_REGION);
                console.log('🔑 KMS 키 ID:', process.env.KMS_KEY_ID);
                console.log('🔐 Access Key:', process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID.substring(0, 4) + '...' + process.env.AWS_ACCESS_KEY_ID.slice(-4) : '없음');
                
                if (process.env.ENABLE_KMS === 'true') {
                    console.log('✅ KMS가 활성화되어 있습니다. KMS 모드로 테스트합니다.');
                    console.log('🧪 암호화/복호화 테스트 시작...');
                    console.log('📝 테스트 데이터: 🧪 KMS 연결 테스트 데이터');
                    console.log('🔐 암호화 시도 중...');
                    console.log('🏗️ KMS 암호화 시작...');
                } else {
                    console.log('⚠️ KMS가 비활성화되어 있습니다. AES 폴백 모드로 작동합니다.');
                }
                
                const { default: comprehensiveEncryption } = await import('./src/utils/encryption/comprehensiveEncryption.js');
                const testResult = await comprehensiveEncryption.testKMSConnection();
                
                console.log('🔧 [DEBUG] testKMSConnection 함수 호출 후, 결과:', testResult);
                
                if (testResult) {
                    console.log('\n🎉 ========== KMS 연결 성공! ==========');
                    console.log('✅ KMS 암호화 시스템이 정상적으로 작동합니다!');
                    console.log('🔐 개인정보가 AWS KMS로 안전하게 암호화됩니다.');
                    console.log('========================================\n');
                } else {
                    console.log('\n❌ ========== KMS 연결 실패! ==========');
                    console.log('⚠️ KMS 암호화 시스템에 문제가 있습니다.');
                    console.log('🔄 AES 폴백 모드로 전환됩니다.');
                    console.log('⚠️ 경고: 개인정보가 암호화되지 않을 수 있습니다!');
                    console.log('\n🔧 KMS 연결 문제 해결 방법:');
                    console.log('1. AWS 인증 정보 확인 (Access Key, Secret Key)');
                    console.log('2. KMS 키 ID 확인:', process.env.KMS_KEY_ID);
                    console.log('3. IAM 사용자 KMS 권한 확인');
                    console.log('4. AWS 리전 설정 확인:', process.env.AWS_REGION);
                    console.log('========================================\n');
                }
            } catch (error) {
                console.log('\n❌ ========== KMS 테스트 실행 오류! ==========');
                console.error('❌ KMS 테스트 실행 중 오류:', error.message);
                console.error('🔍 상세 에러:', error.stack);
                console.log('🔄 서버는 AES 폴백 모드로 계속 작동합니다.');
                console.log('========================================\n');
            }
        }, 2000); // 캐시 초기화 후 2초 뒤 KMS 테스트
    }, 3000); // 3초 후 초기화
});

// 🟢 MongoDB가 준비된 뒤 별점 초기화 스케줄러 시작
mongoose.connection.once('open', () => {
    console.log('MongoDB connected – starting schedulers');
    startResetStarScheduler();          // ⭐ 매너 별점 초기화
    // 필요하다면 다른 스케줄러도 여기서 시작
});
