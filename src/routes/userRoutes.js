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
    declineFriendRequestController,
    blockUserController,
    unblockUserController,
    getBlockedUsersController,
    getSummonerRecord, getPaginatedFriendsController,
    getUserCountController, getGenderCountController,
    getSocialGenderCountController, updateUserPrefsController,
    checkNicknameController,
    getNicknameHistoryController, getGenderHistoryController,
    checkChangeAvailabilityController
} from "../controllers/userController.js";

const router = express.Router();

// 회원가입
router.post('/register', registerUserProfile);

// 🔧 디버깅용 임시 엔드포인트 (서버 상태 확인)
router.get('/debug/server-status', async (req, res) => {
    try {
        const mongoose = await import('mongoose');
        const { User } = await import('../models/UserProfile.js');
        
        const serverStatus = {
            mongodb: {
                connected: mongoose.default.connection.readyState === 1,
                state: mongoose.default.connection.readyState,
                host: mongoose.default.connection.host,
                name: mongoose.default.connection.name
            },
            environment: {
                ENABLE_KMS: process.env.ENABLE_KMS,
                NODE_ENV: process.env.NODE_ENV,
                hasAWSKeys: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
            },
            userModel: {
                available: !!User,
                modelName: User?.modelName
            },
            timestamp: new Date().toISOString()
        };
        
        console.log('📋 서버 상태 디버깅 요청:', serverStatus);
        
        res.json({
            success: true,
            status: serverStatus
        });
    } catch (error) {
        console.error('❌ 서버 상태 확인 실패:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

//유저 수 가져오기
router.get("/user-count", getUserCountController);

// 성별 유저 수
router.get("/gender-count", getGenderCountController);

// 소셜 성별 유저 수
router.get("/social-gender-count", getSocialGenderCountController);

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

// 차단 기능
router.post   ('/:userId/block/:targetUserId',   blockUserController);
router.delete ('/:userId/block/:targetUserId',   unblockUserController);
router.get    ('/:userId/blocked',               getBlockedUsersController);

router.get('/lol/:gameName/:tagLine', getSummonerRecord);

router.get('/:userId/friends', getPaginatedFriendsController);

router.patch('/:userId/prefs', updateUserPrefsController);

router.get("/check-nickname/:nickname", checkNicknameController);

router.get("/:userId/nickname-history", getNicknameHistoryController);

// 성별 히스토리 조회
router.get("/:userId/gender-history", getGenderHistoryController);

// 변경 가능 여부 확인
router.get("/:userId/change-availability", checkChangeAvailabilityController);

export default router;
