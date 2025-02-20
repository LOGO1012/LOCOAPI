import cors from 'cors';

const corsOptions = {
    origin: '*', // 모든 도메인 허용
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'FETCH', 'HEAD', 'OPTIONS'], // 허용할 HTTP 메소드 지정
    allowedHeaders: ['Authorization', 'Cache-Control', 'Content-Type'], // 허용할 요청 헤더 지정
    credentials: true, // 자격증명(쿠키, 인증 정보) 포함 허용
};

const corsConfig = cors(corsOptions);

export default corsConfig;