// server.js
import express from 'express';                          // Express 모듈 불러오기
import cors from "cors";
import dotenv from 'dotenv';                            // 환경 변수 로드를 위한 dotenv 모듈
import authRoutes from './src/routes/authRoutes.js';    // 인증 관련 라우터 불러오기
import connectMongoDB from './src/config/mongoDB.js';   // MongoDB 연결 함수 불러오기
import userRoutes from './src/routes/userRoutes.js';    // (추가): 회원가입 관련 라우터 (예: /api/user/register)
import session from 'express-session';
import productRoutes from './src/routes/productRoutes.js';  // 상품 라우터 추가
import kakaoPayRoutes from './src/routes/kakaoPayRoutes.js';
import naverPayRoutes from './src/routes/naverPayRoutes.js';
import './src/scheduler/recurringSubscriptions.js';


dotenv.config();                                        // .env 파일의 환경 변수 로드
connectMongoDB();                                       // MongoDB 연결 시도; 성공/실패 메시지는 mongoDB.js 내에서 출력됨



const app = express();                                  // Express 앱 생성
// CORS 설정 추가: 프론트엔드 주소를 허용
app.use(cors({
    origin: 'http://localhost:5173', // 프론트엔드 주소
    credentials: true,               // 쿠키 등 자격증명 허용 여부
}));

app.use(express.json());                                // JSON 요청 본문 파싱 미들웨어 등록

// express-session 미들웨어 설정 (추가)
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'your_session_secret',  // (추가) 세션 암호화 키, 환경변수로 관리 권장
        resave: false,                  // (추가) 세션 재저장을 방지
        saveUninitialized: false,       // (추가) 초기화되지 않은 세션 저장 방지
        cookie: { secure: false }       // (추가) HTTPS 사용 시 secure: true로 설정
    })
);
import express from 'express';
import connectMongoDB from './src/config/mongoDB.js';
import chatRoutes from "./src/routes/chatRoutes.js";
import http from "http";
import { initializeSocket } from "./src/socket/socketIO.js";
import cors from "cors";
import userRoutes from "./src/routes/userRoutes.js";

const app = express();
const server = http.createServer(app);

// '/api/auth' 경로로 들어오는 요청은 authRoutes로 라우팅
app.use('/api/auth', authRoutes);
// (추가): 회원가입 관련 API 라우팅, 예를 들어 '/api/user'
app.use('/api/user', userRoutes);
app.use('/api/product', productRoutes); // 상품 라우터 마운트
// ✅ CORS 설정 추가
app.use(cors({
    origin: "http://localhost:5173", // React 프론트엔드 도메인 허용
    credentials: true, // 쿠키 포함 요청 허용 (필요 시)
}));

// 결제 관련 라우트 등록
app.use('/api/kakao-pay', kakaoPayRoutes);
app.use('/api/naver-pay', naverPayRoutes);
// MongoDB 연결
connectMongoDB();

// 서버 포트 설정: 환경 변수 PORT가 없으면 기본값 3000 사용
const PORT = process.env.PORT || 3000;

// Express 서버 실행: 지정된 포트에서 앱 실행, 성공 시 콘솔 메시지 출력
app.listen(PORT, () => {
// Socket.IO 초기화
const io = initializeSocket(server);

app.use(express.json());
// 라우트 설정
app.use('/api/chat', chatRoutes);
app.use("/api", userRoutes);


const PORT = 3000;
server.listen(3000, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

