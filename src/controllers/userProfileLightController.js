// userProfileLightController.js
// 목적: getUserInfo의 과도한 데이터 전송 문제 해결
// 기존: 15+ 필드를 항상 전송 → 최적화: 필요한 필드만 선택적 전송

import {
    getUserMinimal,
    getUserForProfile,
    getUserChatStatus,
    getUserForEdit,
    getUserFriendIds
} from '../services/userProfileLightService.js';

/**
 * 1) 최소 프로필 조회 (ProfileButton, 채팅 오버레이용)
 * GET /api/user/:userId/profile-minimal
 * 반환: _id, nickname, profilePhoto (3개 필드만)
 */
export const getUserMinimalController = async (req, res) => {
    const { userId } = req.params;
    try {
        const data = await getUserMinimal(userId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * 2) 풀 프로필 조회 (SimpleProfileModal용)
 * GET /api/user/:userId/profile-full
 * 반환: 모달 표시에 필요한 9개 필드
 */
export const getUserFullProfileController = async (req, res) => {
    const { userId } = req.params;
    try {
        const data = await getUserForProfile(userId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * 3) 채팅 상태 조회 (RandomChatComponent용)
 * GET /api/user/:userId/chat-status
 * 반환: 채팅 횟수, 충전 정보, 신고 상태 등
 */
export const getUserChatStatusController = async (req, res) => {
    const { userId } = req.params;

    // ✅ 권한 체크
    if (req.user._id.toString() !== userId) {
        return res.status(403).json({
            success: false,
            message: '본인의 채팅 상태만 조회할 수 있습니다.'
        });
    }

    try {
        const data = await getUserChatStatus(userId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * 4) 프로필 편집 정보 조회
 * GET /api/user/:userId/profile-edit
 */
export const getUserForEditController = async (req, res) => {
    const { userId } = req.params;

    // ✅ 권한 체크
    if (req.user._id.toString() !== userId) {
        return res.status(403).json({
            success: false,
            message: '본인의 프로필만 편집할 수 있습니다.'
        });
    }

    try {
        const data = await getUserForEdit(userId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * 친구 ID 목록 조회
 * GET /api/user/:userId/friends-ids
 * 반환: { friendIds: string[] }
 * 사용처: SimpleProfileModal의 isFriend 체크
 */
export const getUserFriendIdsController = async (req, res) => {
    const { userId } = req.params;

    // ✅ 권한 체크
    if (req.user._id.toString() !== userId) {
        return res.status(403).json({
            success: false,
            message: '본인의 친구 목록만 조회할 수 있습니다.'
        });
    }

    try {
        const result = await getUserFriendIds(userId);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        const statusCode = error.message.includes('찾을 수 없습니다') ? 404 : 500;

        res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
};