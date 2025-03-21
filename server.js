import express from 'express';
import connectMongoDB from './src/config/mongoDB.js';
import chatRoutes from "./src/routes/chatRoutes.js";
import http from "http";
import { initializeSocket } from "./src/socket/socketIO.js";
import cors from "cors";
import userRoutes from "./src/routes/userRoutes.js";
import communityRoutes from "./src/routes/communityRoutes.js";
import path from "path";

const app = express();
const server = http.createServer(app);

// ✅ CORS 설정 추가
app.use(cors({
    origin: "http://localhost:5173", // React 프론트엔드 도메인 허용
    credentials: true, // 쿠키 포함 요청 허용 (필요 시)
}));

// MongoDB 연결
connectMongoDB();

// Socket.IO 초기화
const io = initializeSocket(server);

app.use(express.json());
// 라우트 설정
app.use('/api/chat', chatRoutes);
app.use("/api/user", userRoutes);
app.use("/api/communities", communityRoutes);
// uploads 폴더를 정적(static)으로 제공
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));


const PORT = 3000;
server.listen(3000, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
