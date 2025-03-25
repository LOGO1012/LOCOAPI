// src/routes/naverPayRoutes.js
import express from 'express';
import {
    naverPayReady,
    naverPayApprove,
    naverPayCancel,
    naverPayFail
} from '../controllers/naverPayController.js';

const router = express.Router();

router.post('/ready', naverPayReady);
router.get('/approve', naverPayApprove);
router.get('/cancel', naverPayCancel);
router.get('/fail', naverPayFail);

export default router;
