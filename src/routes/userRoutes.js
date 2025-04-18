// src/routes/userRoutes.js
import express from 'express';
import { registerUserProfile } from '../controllers/userProfileController.js';
import {
    decrementChatCountController,
    getUserByNicknameController,
    getUserInfo,
    rateUserController,
    updateUserProfile,
    acceptFriendRequestController,
    sendFriendRequestController,
    getFriendRequestsController,
    deleteFriendController,
    declineFriendRequestController  // 새로 추가
} from "../controllers/userController.js";

const router = express.Router();

// 회원가입
router.post('/register', registerUserProfile);

// 사용자 정보 가져오기
router.get("/:userId", getUserInfo);

// 유저 별점 업데이트 엔드포인트
router.post("/:userId/rate", rateUserController);

// 프로필 업데이트
router.patch("/:userId", updateUserProfile);

// 별칭으로 사용자 정보 조회
router.get("/nickname/:nickname", getUserByNicknameController);

// 채팅 종료 후 채팅 횟수 감소
router.post("/:userId/decrementChatCount", decrementChatCountController);

// 친구 요청 수락 엔드포인트
router.post("/:userId/friend-request/accept", acceptFriendRequestController);

// 친구 요청 보내기 엔드포인트
router.post("/:userId/friend-request", sendFriendRequestController);

// 친구 요청 목록 조회 엔드포인트
router.get("/:userId/friend-requests", getFriendRequestsController);

// 친구 요청 거절
router.post('/:userId/friend-request/decline', declineFriendRequestController);

// 친구 삭제
router.delete("/:userId/friends/:friendId", deleteFriendController);

export default router;
