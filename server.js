// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import http from 'http';
import path from 'path';
import cookieParser from "cookie-parser";

import developerRoutes from './src/routes/developerRoutes.js';

import authRoutes from './src/routes/authRoutes.js';
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

import searchRouter from './src/routes/searchRouter.js';
import mongoose from "mongoose";
import {startResetStarScheduler} from "./src/scheduler/resetStarScheduler.js";

dotenv.config(); // 환경 변수 로드

// MongoDB 연결 (실패/성공 메시지는 mongoDB.js에서 처리)
connectMongoDB();

const app = express();

// 미들웨어 설정
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
}));
app.use(cookieParser()); // 쿠키 파서를 추가

// 미들웨어 추가: res.cookie() 호출 시 로그 출력
app.use((req, res, next) => {
    const originalCookie = res.cookie;
    res.cookie = function(name, value, options) {
        console.log(`Setting cookie: ${name}`, value, options);
        return originalCookie.call(this, name, value, options);
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

// 라우터 등록
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/product', productRoutes);
app.use('/api/kakao-pay', kakaoPayRoutes);
app.use('/api/naver-pay', naverPayRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/qna', qnaRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/reportNotification', reportNotificationRoutes)
app.use('/api/upload', uploadRoutes);
app.use("/api/pr", prRoutes);
app.use('/api/developer', developerRoutes);

app.use('/api/search', searchRouter);

// HTTP 서버 생성 및 Socket.IO 초기화
const server = http.createServer(app);
const io = initializeSocket(server);

// 포트 설정 및 서버 실행
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// 🟢 MongoDB가 준비된 뒤 별점 초기화 스케줄러 시작
mongoose.connection.once('open', () => {
    console.log('MongoDB connected – starting schedulers');
    startResetStarScheduler();          // ⭐ 매너 별점 초기화
    // 필요하다면 다른 스케줄러도 여기서 시작
});
