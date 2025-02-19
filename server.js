import express from 'express';
import connectMongoDB from './src/config/mongoDB.js'; // 경로 수정

const app = express();
const PORT = 3000;

app.use(express.json());

connectMongoDB();

app.listen(8000, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
