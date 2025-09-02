import redis from 'redis';
import dotenv from "dotenv";

dotenv.config();
// ✅ 환경변수 로딩 확인
console.log('REDIS_PASSWORD:', process.env.REDIS_PASSWORD ? '설정됨' : '설정안됨');
// Redis 클라이언트 생성
const redisClient = redis.createClient({
    host: 'localhost',
    port: 6379,
    password: process.env.REDIS_PASSWORD,
});

// 연결 이벤트 처리
redisClient.on('connect', () => {
    console.log('✅ Redis 연결 성공!');
});

redisClient.on('error', (err) => {
    console.error('❌ Redis 연결 오류:', err);
});

// Redis 연결 (v4 이상에서 필요)
redisClient.connect().catch(console.error);

// ❌ 중복 export 제거 - 하나만 사용
export default redisClient;
