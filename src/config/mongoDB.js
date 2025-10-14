import mongoose from 'mongoose';

// MongoDB 연결
const connectMongoDB = async () => {
    try {
        const mongoURI = 'mongodb://loco:loco98@192.168.219.101/locodb';

        console.log('MongoDB 연결 시도...');

        await mongoose.connect(mongoURI);

        console.log('MongoDB에 성공적으로 연결되었습니다...');

    } catch (error) {

        console.error(`MongoDB 연결 오류: ${error.message}`);

        process.exit(1); // 연결 실패 시 애플리케이션 종료
    }
};

export default connectMongoDB;
