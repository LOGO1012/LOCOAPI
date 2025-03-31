// src/routes/userRoutes.js
import express from 'express';                     // Express 모듈 불러오기
import { registerUserProfile } from '../controllers/userProfileController.js'; // 회원가입 컨트롤러 함수 불러오기
import {getUserByNicknameController, getUserInfo, rateUserController} from "../controllers/userController.js";

const router = express.Router();                   // Express 라우터 인스턴스 생성

// POST /api/user/register - 회원가입 API 엔드포인트 등록
router.post('/register', registerUserProfile);

// 사용자 정보 가져오기
router.get("/:userId", getUserInfo);
router.post("/:userId/rate", rateUserController);

// 별칭으로 사용자 정보 조회
router.get("/nickname/:nickname", getUserByNicknameController);


export default router;
