// routes/userRoutes.js
import express from "express";
import { getUserInfo } from "../controllers/userController.js";

const router = express.Router();

// 사용자 정보 가져오기
router.get("/user/:userId", getUserInfo);


export default router;
