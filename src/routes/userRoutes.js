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
    getBlockedUsersController,
    getSummonerRecord, getPaginatedFriendsController,
    getUserCountController, getGenderCountController,
    getSocialGenderCountController, updateUserPrefsController,
    checkNicknameController,
    getNicknameHistoryController, getGenderHistoryController,
    checkChangeAvailabilityController,
    deactivateUser,
    reactivateUser,
    archiveAndPrepareNewController,
    updateWordFilter, getFriendRequestCountController
} from "../controllers/userController.js";
import { authenticate } from '../middlewares/authMiddleware.js';
// ✅ 신규 추가
import {
    getUserBasicController,
    getUserRiotInfoController,
    getUserNicknameController,
    getUserFriendProfileController,
    blockUserMinimalController,
    unblockUserMinimalController
} from "../controllers/userLightController.js";

import {
    getUserMinimalController,
    getUserFullProfileController,
    getUserChatStatusController,
    getUserForEditController,
    getUserFriendIdsController
} from '../controllers/userProfileLightController.js';
import {requireLevel} from "../middlewares/requireLevel.js";


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


router.get("/:userId/basic", getUserBasicController);
router.get("/:userId/riot-info", getUserRiotInfoController);
router.get("/:userId/nickname", getUserNicknameController);
router.get("/:userId/friend-profile", getUserFriendProfileController);


router.get("/:userId/profile-minimal", getUserMinimalController);     // 최소 프로필
router.get("/:userId/profile-full", getUserFullProfileController);    // 풀 프로필
router.get("/:userId/chat-status",  authenticate, getUserChatStatusController);      // 채팅 상태
router.get("/:userId/profile-edit", authenticate, getUserForEditController);             // 프로필 편집용 경량 API
router.get('/:userId/friends-ids',  authenticate, getUserFriendIdsController);

//차단
router.post('/:userId/block/:targetUserId/minimal', authenticate, blockUserMinimalController);
router.delete('/:userId/block/:targetUserId/minimal', authenticate, unblockUserMinimalController);

//유저 수 가져오기
router.get("/user-count", getUserCountController);

// 성별 유저 수
router.get("/gender-count", getGenderCountController);

// 소셜 성별 유저 수
router.get("/social-gender-count", getSocialGenderCountController);

// 사용자 정보 가져오기
router.get("/:userId", getUserInfo);


// 유저 별점 업데이트 엔드포인트
router.post("/:userId/rate", authenticate, rateUserController);

// 프로필 업데이트
router.patch("/:userId", authenticate, updateUserProfile);

// 별칭으로 사용자 정보 조회
router.get("/nickname/:nickname", getUserByNicknameController);

// 채팅 종료 후 채팅 횟수 감소
router.post("/:userId/decrementChatCount", authenticate, decrementChatCountController);

// 친구 요청 수락 엔드포인트
router.post("/:userId/friend-request/accept", authenticate, acceptFriendRequestController);

// 친구 요청 보내기 엔드포인트
router.post("/:userId/friend-request", authenticate, sendFriendRequestController);

//친구 신청 갯수
router.get("/:userId/friend-requests/count", authenticate, getFriendRequestCountController);

// 친구 요청 목록 조회 엔드포인트
router.get("/:userId/friend-requests", authenticate, getFriendRequestsController);

// 친구 요청 거절
router.post('/:userId/friend-request/decline', authenticate, declineFriendRequestController);

// 친구 삭제
router.delete("/:userId/friends/:friendId", authenticate, deleteFriendController);

// 차단 기능
// router.post   ('/:userId/block/:targetUserId',   blockUserController);
// router.delete ('/:userId/block/:targetUserId',   unblockUserController);
router.get    ('/:userId/blocked', authenticate, getBlockedUsersController);

router.get('/lol/:gameName/:tagLine', getSummonerRecord);

router.get('/:userId/friends',  authenticate, getPaginatedFriendsController);

router.patch('/:userId/prefs', authenticate, updateUserPrefsController);

router.get("/check-nickname/:nickname", checkNicknameController);

router.get("/:userId/nickname-history", authenticate, requireLevel(3), getNicknameHistoryController);

// 성별 히스토리 조회
router.get("/:userId/gender-history", authenticate, requireLevel(3), getGenderHistoryController);

// 변경 가능 여부 확인
router.get("/:userId/change-availability", authenticate, checkChangeAvailabilityController);

// 회원 탈퇴
router.post("/deactivate", authenticate, deactivateUser);

// 회원 재활성화
router.post("/reactivate", reactivateUser);

// 신규 가입을 위한 기존 계정 아카이브
router.post("/archive-and-prepare-new", archiveAndPrepareNewController);

// 욕설 필터 설정 (만 19세 이상만)
router.patch('/:userId/word-filter', authenticate, updateWordFilter);

export default router;
