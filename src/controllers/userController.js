// controllers/userController.js
import {
    acceptFriendRequestService, blockUserService, declineFriendRequestService,
    decrementChatCount, deleteFriend, getBlockedUsersService, getFriendRequests, getPaginatedFriends,
    getUserById,
    getUserByNickname, sendFriendRequest, unblockUserService
} from "../services/userService.js";
import { rateUser } from "../services/userService.js";
import { User } from "../models/UserProfile.js";
import {io} from "../socket/socketIO.js";
import {getLoLRecordByRiotId} from "../middlewares/getLoLRecordBySummonerName.js";

// 사용자 정보를 가져오는 컨트롤러 함수
export const getUserInfo = async (req, res) => {
    const { userId } = req.params;
    try {
        const user = await getUserById(userId); // 서비스 호출
        res.status(200).json({
            success: true,
            data: user,
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
};

// 사용자 프로필 업데이트 컨트롤러 (PATCH 요청)
// 로코 코인(coinLeft)과 생년월일(birthdate)은 수정할 수 없도록 업데이트에서 제거합니다.
export const updateUserProfile = async (req, res, next) => {
    const { userId } = req.params;
    const updates = req.body;

    // 수정할 수 없는 필드는 업데이트 객체에서 제거
    if ("coinLeft" in updates) delete updates.coinLeft;
    if ("birthdate" in updates) delete updates.birthdate;

    try {
        const updatedUser = await User.findByIdAndUpdate(userId, updates, { new: true });
        if (!updatedUser) {
            return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
        }
        return res.status(200).json({
            success: true,
            message: "프로필 업데이트 성공",
            user: updatedUser,
        });
    } catch (error) {
        console.error("프로필 업데이트 에러:", error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};




export const rateUserController = async (req, res) => {
    try {
        const { userId } = req.params;
        const { rating } = req.body;
        const updatedUser = await rateUser(userId, rating);
        res.status(200).json({
            success: true,
            message: "User rated successfully.",
            user: updatedUser
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * 별칭을 이용하여 사용자 정보를 가져오는 컨트롤러 함수
 */
export const getUserByNicknameController = async (req, res) => {
    const { nickname } = req.params;
    try {
        const user = await getUserByNickname(nickname);
        res.status(200).json({
            success: true,
            data: user,
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
};

export const decrementChatCountController = async (req, res) => {
    try {
        const { userId } = req.params;
        const updatedUser = await decrementChatCount(userId);
        res.status(200).json({
            success: true,
            message: "Chat count decremented successfully.",
            user: updatedUser,
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
};

export const acceptFriendRequestController = async (req, res) => {
    const { requestId } = req.body; // 클라이언트에서 친구 요청 ID를 전달받음
    try {
        const result = await acceptFriendRequestService(requestId);
        res.status(200).json({
            success: true,
            message: "친구 요청을 수락하였으며, 친구 목록에 추가되었습니다.",
            data: result
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// 친구 요청 보내기 컨트롤러
export const sendFriendRequestController = async (req, res) => {
    const { senderId, receiverId } = req.body;
    try {
        // 친구 요청 생성
        const newRequest = await sendFriendRequest(senderId, receiverId);
        // 보낸 유저의 정보를 가져와 닉네임을 조회
        const senderUser = await getUserById(senderId);

        // 보낸 유저의 닉네임을 포함하여 알림 전송
        io.to(receiverId).emit('friendRequestNotification', {
            message: `${senderUser.nickname}님이 친구 요청을 보냈습니다.`,
            friendRequest: newRequest,
        });

        res.status(200).json({
            success: true,
            message: "친구 요청을 보냈습니다.",
            data: newRequest
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};


// 친구 요청 목록 조회 컨트롤러 (수신한 요청 목록)
export const getFriendRequestsController = async (req, res) => {
    const { userId } = req.params; // 수신자(현재 로그인 사용자) ID
    try {
        const requests = await getFriendRequests(userId);
        res.status(200).json({
            success: true,
            data: requests
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// 친구 요청 거절 컨트롤러 함수
export const declineFriendRequestController = async (req, res) => {
    const { requestId } = req.body;   // 클라이언트에서 전송된 친구 요청 ID
    try {
        const result = await declineFriendRequestService(requestId);
        res.status(200).json({
            success: true,
            message: result.message,
            data: result,
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
};


// 친구 삭제 컨트롤러
export const deleteFriendController = async (req, res) => {
    const { userId, friendId } = req.params;
    try {
        const result = await deleteFriend(userId, friendId);
        res.status(200).json({
            success: true,
            message: result.message,
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * 사용자 차단
 */
export const blockUserController = async (req, res) => {
    const { userId, targetUserId } = req.params;
    try {
        const updated = await blockUserService(userId, targetUserId);
        res.status(200).json({ success: true, data: updated.blockedUsers });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

/**
 * 차단 해제
 */
export const unblockUserController = async (req, res) => {
    const { userId, targetUserId } = req.params;
    try {
        const updated = await unblockUserService(userId, targetUserId);
        res.status(200).json({ success: true, data: updated.blockedUsers });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

/**
 * 차단 목록 조회
 */
export const getBlockedUsersController = async (req, res) => {
    const { userId } = req.params;
    try {
        const blocked = await getBlockedUsersService(userId);
        res.status(200).json({ success: true, data: blocked });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

export async function getSummonerRecord(req, res) {
    try {
        const { gameName, tagLine } = req.params;
        const data = await getLoLRecordByRiotId(`${gameName}#${tagLine}`);
        return res.status(200).json({ success: true, data });
    } catch (err) {
        console.error(err);
        const status = /403/.test(err.message) ? 502   // 키 문제
            : /404/.test(err.message) ? 404   // Riot ID 없음
                : /429/.test(err.message) ? 503   // 레이트 리밋
                    : 500;
        return res.status(status).json({ success: false, message: err.message });
    }
}


export const getPaginatedFriendsController = async (req, res) => {
    const { userId } = req.params;
    const offset = Number(req.query.offset ?? 0);
    const limit  = Number(req.query.limit  ?? 20);

    try {
        const data = await getPaginatedFriends(userId, offset, limit);
        res.status(200).json({ success: true, ...data });
    } catch (e) {
        res.status(400).json({ success: false, message: e.message });
    }
};