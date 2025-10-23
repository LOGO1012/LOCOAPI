// ============================================================================
// 경량 사용자 프로필 컨트롤러
// 목적: 각 사용 사례에 최적화된 API 엔드포인트 제공
// ============================================================================

import {
    getUserBasicProfile,
    getUserRiotInfo,
    getUserNickname,
    getUserFriendProfile,
    blockUserServiceMinimal,
    unblockUserServiceMinimal
} from '../services/userLightService.js';

/**
 * 기본 프로필 조회
 * GET /api/user/:userId/basic
 * 반환: { _id, nickname, profilePhoto }
 * 사용처: 채팅방, 친구목록, 메시지 sender
 */
export const getUserBasicController = async (req, res) => {
    const { userId } = req.params;

    try {
        const user = await getUserBasicProfile(userId);

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        // 404: 사용자를 찾을 수 없음
        const statusCode = error.message.includes('찾을 수 없습니다') ? 404 : 500;

        res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Riot ID 조회
 * GET /api/user/:userId/riot-info
 * 반환: { riotGameName, riotTagLine }
 * 사용처: 롤 전적 조회
 */
export const getUserRiotInfoController = async (req, res) => {
    const { userId } = req.params;

    try {
        const riotInfo = await getUserRiotInfo(userId);

        res.status(200).json({
            success: true,
            data: riotInfo
        });
    } catch (error) {
        // Riot ID 미설정은 404
        const statusCode = error.message.includes('설정되지') ? 404 : 500;

        res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * 닉네임 조회
 * GET /api/user/:userId/nickname
 * 반환: { nickname }
 * 사용처: 채팅방 입장 시
 */
export const getUserNicknameController = async (req, res) => {
    const { userId } = req.params;

    try {
        const user = await getUserNickname(userId);

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        const statusCode = error.message.includes('찾을 수 없습니다') ? 404 : 500;

        res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * 친구 프로필 조회
 * GET /api/user/:userId/friend-profile
 * 반환: { _id, nickname, profilePhoto, star, gender }
 * 사용처: 친구 추가 시, 친구 목록
 */
export const getUserFriendProfileController = async (req, res) => {
    const { userId } = req.params;

    try {
        const user = await getUserFriendProfile(userId);

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        const statusCode = error.message.includes('찾을 수 없습니다') ? 404 : 500;

        res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
};


/**
 * 사용자 차단 (최소 응답)
 * POST /api/user/:userId/block/:targetUserId/minimal
 */
export const blockUserMinimalController = async (req, res) => {
    const { userId, targetUserId } = req.params;

    try {
        // ✅ 수정: 반환값을 받아서 사용
        const blockedUser = await blockUserServiceMinimal(userId, targetUserId);


        res.status(200).json({
            success: true,
            message: "사용자를 차단했습니다.",
            blockedUser: blockedUser
        });

    } catch (err) {
        console.error(`❌ [차단 실패] ${userId} -> ${targetUserId}:`, err);
        res.status(400).json({
            success: false,
            message: err.message
        });
    }
};

/**
 * 차단 해제 (최소 응답)
 * DELETE /api/user/:userId/block/:targetUserId/minimal
 */
export const unblockUserMinimalController = async (req, res) => {
    const { userId, targetUserId } = req.params;

    try {
        await unblockUserServiceMinimal(userId, targetUserId);

        res.status(200).json({
            success: true,
            message: "차단이 해제되었습니다."
        });
    } catch (err) {
        console.error(`❌ [차단 해제 실패] ${userId} -> ${targetUserId}:`, err);
        res.status(400).json({
            success: false,
            message: err.message
        });
    }
};