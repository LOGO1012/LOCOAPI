// src/controllers/productController.js
import { Product } from '../models/Product.js';

// 전체 상품 목록 조회
export const getProducts = async (req, res, next) => {
    try {
        const products = await Product.find();
        return res.json(products);
    } catch (error) {
        next(error);
    }
};

// 신규 상품 추가
export const addProduct = async (req, res, next) => {
    try {
        const product = new Product(req.body);
        await product.save();
        return res.json(product);
    } catch (error) {
        next(error);
    }
};

// 상품 수정
export const updateProduct = async (req, res, next) => {
    try {
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        return res.json(product);
    } catch (error) {
        next(error);
    }
};
