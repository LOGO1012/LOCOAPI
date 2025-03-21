// backend/routes/naverPayRoutes.js
import express from 'express';
import { naverPayReady } from '../controllers/naverPayController.js'; // .js 확장자도 필요합니다.

const router = express.Router();

router.post('/ready', naverPayReady);

export default router;
