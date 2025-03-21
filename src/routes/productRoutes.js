// src/routes/productRoutes.js
import express from 'express';
import { getProducts, addProduct, updateProduct } from '../controllers/productController.js';

const router = express.Router();

// GET /api/product - 전체 상품 목록 조회
router.get('/', getProducts);

// POST /api/product/add - 신규 상품 추가
router.post('/add', addProduct);

// PUT /api/product/update/:id - 상품 수정
router.put('/update/:id', updateProduct);

export default router;
