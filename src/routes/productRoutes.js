// src/routes/productRoutes.js
import express from 'express';
import { getProducts, addProduct, updateProduct } from '../controllers/productController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requireLevel } from '../middlewares/requireLevel.js';


const router = express.Router();

// GET /api/product - 전체 상품 목록 조회
router.get('/', getProducts);

// POST /api/product/add       - 신규 상품 추가 (userLv ≥ 3만 접근)
router.post(
    '/add',
    authenticate,
    requireLevel(3),
    addProduct
);

// PUT  /api/product/update/:id - 상품 수정      (userLv ≥ 3만 접근)
router.put(
    '/update/:id',
    authenticate,
    requireLevel(3),
    updateProduct
);

export default router;
