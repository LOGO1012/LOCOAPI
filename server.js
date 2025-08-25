// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cookieParser from "cookie-parser";
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'mongo-sanitize';

import developerRoutes from './src/routes/developerRoutes.js';

import authRoutes from './src/routes/authRoutes.js';
import naverAuthRoutes from './src/routes/naverAuthRoutes.js';
import userRoutes from './src/routes/userRoutes.js';
import productRoutes from './src/routes/productRoutes.js';
import kakaoPayRoutes from './src/routes/kakaoPayRoutes.js';
import naverPayRoutes from './src/routes/naverPayRoutes.js';
import chatRoutes from './src/routes/chatRoutes.js';
import communityRoutes from './src/routes/communityRoutes.js';
import { initializeSocket } from './src/socket/socketIO.js';
import connectMongoDB from './src/config/mongoDB.js';
import './src/scheduler/recurringSubscriptions.js'; // 스케줄러
import qnaRoutes from "./src/routes/qnaRoutes.js";
import uploadRoutes from './src/routes/uploadRoutes.js';
import reportRoutes from "./src/routes/reportRoutes.js";
import reportNotificationRoutes from "./src/routes/reportNotificationRoutes.js";
import prRoutes from "./src/routes/prRoutes.js";
import onlineStatusRoutes from './src/routes/onlineStatusRoutes.js';

import searchRouter from './src/routes/searchRouter.js';
import newsRoutes from './src/routes/newsRoutes.js';
import editorRoutes from './src/routes/editorRoutes.js';
import bannerRoutes from './src/routes/bannerRoutes.js';
import mongoose from "mongoose";
import {startResetStarScheduler} from "./src/scheduler/resetStarScheduler.js";

dotenv.config(); // 환경 변수 로드

// MongoDB 연결 (실패/성공 메시지는 mongoDB.js에서 처리)
connectMongoDB();

const app = express();

// ===========================================
// 🛡️ 보안 미들웨어 적용
// ===========================================

// 1. Helmet - 기본 보안 헤더 설정
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "http:"],
            scriptSrc: ["'self'"],
            connectSrc: ["'self'", "wss:", "ws:", "http:", "https:"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// 2. Rate Limiting - API 호출 제한
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 1000, // 일반 API 최대 1000회 요청
    message: {
        error: '너무 많은 요청이 발생했습니다. 15분 후 다시 시도해주세요.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 10, // 로그인 시도 최대 10회
    skipSuccessfulRequests: true,
    message: {
        error: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.'
    }
});

const chatLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1분
    max: 30, // 채팅 메시지 최대 30개
    message: {
        error: '채팅 전송이 너무 빠릅니다. 잠시 후 다시 시도해주세요.'
    }
});

// Rate limiting 적용
app.use('/api', generalLimiter);
app.use('/api/auth', loginLimiter);
app.use('/api/chat', chatLimiter);

// 3. 입력값 보안 미들웨어
app.use((req, res, next) => {
    // NoSQL Injection 방지
    req.body = mongoSanitize(req.body);
    req.query = mongoSanitize(req.query);
    req.params = mongoSanitize(req.params);
    next();
});

// ===========================================
// 기본 미들웨어 설정
// ===========================================

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

app.use(express.json({ limit: '10mb' })); // JSON 크기 제한


app.use(session({
    secret: process.env.SESSION_SECRET || 'your_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24시간
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

// 기본 라우트
app.get('/', (req, res) => {
    res.json({ 
        message: '🚀 LOCO API Server Running',
        version: '1.0.0',
        security: '🛡️ Enhanced Security Enabled',
        timestamp: new Date().toISOString()
    });
});

// ===========================================
// 📍 API 라우터 등록
// ===========================================

// Auth routes (카카오, 네이버 로그인)
app.use('/api/auth', authRoutes);
app.use('/api/auth', naverAuthRoutes);  // 네이버 인증 라우트

// API routes
app.use('/api/user', userRoutes);  // 사용자 관리
app.use('/api/product', productRoutes);  // 상품 관리
app.use('/api/kakao-pay', kakaoPayRoutes);  // 카카오페이
app.use('/api/naver-pay', naverPayRoutes);  // 네이버페이
app.use('/api/chat', chatRoutes);  // 채팅 기능
app.use('/api/communities', communityRoutes);  // 커뮤니티
app.use('/api/qna', qnaRoutes);  // Q&A
app.use('/api/report', reportRoutes);  // 신고 기능
app.use('/api/reportNotification', reportNotificationRoutes);  // 신고 알림
app.use('/api/upload', uploadRoutes);  // 파일 업로드
app.use('/api/pr', prRoutes);  // PR 기능
app.use('/api/developer', developerRoutes);  // 개발자 기능
app.use('/api/online-status', onlineStatusRoutes);  // 온라인 상태
app.use('/api/search', searchRouter);  // 검색 기능
app.use('/api/news', newsRoutes);  // 뉴스
app.use('/api/editor', editorRoutes);  // 에디터
app.use('/api/banners', bannerRoutes);  // 배너 관리

// 404 에러 핸들링
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'API 엔드포인트를 찾을 수 없습니다',
        path: req.originalUrl,
        method: req.method
    });
});

// ===========================================
// 🚨 글로벌 에러 핸들링
// ===========================================
app.use((error, req, res, next) => {
    console.error('❌ Server Error:', error);
    
    // 프로덕션에서는 상세 에러 정보 숨김
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    res.status(error.status || 500).json({
        error: isDevelopment ? error.message : '서버 내부 오류가 발생했습니다',
        ...(isDevelopment && { stack: error.stack })
    });
});

// HTTP 서버 생성 및 Socket.IO 초기화
const server = http.createServer(app);
const io = initializeSocket(server);

// 포트 설정 및 서버 실행
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 LOCO API Server Started Successfully!');
    console.log('📅 Time:', new Date().toLocaleString());
    console.log('🌐 Port:', PORT);
    console.log('🛡️ Security: Enhanced Protection Enabled');
    console.log('🔐 Encryption: Personal Data Protected');
    console.log('📊 Rate Limiting: Active');
    console.log('🗄️ Database: MongoDB Connected');
    console.log('⚡ Socket.IO: Real-time Communication Ready');
    console.log('='.repeat(50) + '\n');
});

// 🟢 MongoDB가 준비된 뒤 별점 초기화 스케줄러 시작
mongoose.connection.once('open', () => {
    console.log('👍 MongoDB connected – starting schedulers');
    startResetStarScheduler();          // ⭐ 매너 별점 초기화
    // 필요하다면 다른 스케줄러도 여기서 시작
});
