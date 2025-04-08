import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import { reserveOrder, naverPayApprove, naverPayCancel, naverPayFail } from '../controllers/naverPayController.js';

const router = express.Router();

router.post('/reserve', authenticate, reserveOrder);
router.get('/approve', naverPayApprove);
router.get('/cancel', naverPayCancel);
router.get('/fail', naverPayFail);

export default router;
