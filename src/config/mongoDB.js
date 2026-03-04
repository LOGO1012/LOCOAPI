import mongoose from 'mongoose';

// NoSQL Injection 추가 방어: 스키마에 정의되지 않은 필드로의 쿼리 차단
mongoose.set('strictQuery', true);

// MongoDB 연결
const connectMongoDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            throw new Error('MONGO_URI 환경변수가 설정되지 않았습니다.');
        }

        console.log('MongoDB 연결 시도...');

        await mongoose.connect(mongoURI, {
            socketTimeoutMS: 30000,
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000
        });

        console.log('MongoDB에 성공적으로 연결되었습니다...');

    } catch (error) {

        console.error(`MongoDB 연결 오류: ${error.message}`);

        process.exit(1); // 연결 실패 시 애플리케이션 종료
    }
};

export default connectMongoDB;
