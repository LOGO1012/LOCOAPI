// routes/userRoutes.js
import express from "express";
import {getUserInfo, rateUserController} from "../controllers/userController.js";

const router = express.Router();

// 사용자 정보 가져오기
router.get("/:userId", getUserInfo);
router.post("/:userId/rate", rateUserController);


export default router;
