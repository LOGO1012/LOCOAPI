// controllers/userController.js
import mongoose from 'mongoose';
import {
    acceptFriendRequestService,
    declineFriendRequestService,
    decrementChatCount,
    deleteFriend,
    getBlockedUsersService,
    getFriendRequests, getPaginatedFriends,
    getUserById,
    getUserByNickname, sendFriendRequest,
    deactivateUserService,
    reactivateUserService,
    archiveAndPrepareNew
} from "../services/userService.js";
import jwt from 'jsonwebtoken';
import { rateUser } from "../services/userService.js";
import { User } from "../models/UserProfile.js";
import {io} from "../socket/socketIO.js";
import {getLoLRecordByRiotId} from "../middlewares/getLoLRecordBySummonerName.js";
import {FriendRequest} from "../models/FriendRequest.js";
import {
    saveNicknameHistory,
    saveGenderHistory,
    getTodayNicknameChangeCount,
    getTodayGenderChangeCount,
    getLastNicknameChangeTime,
    getLastGenderChangeTime,
    getGenderHistory, getNicknameHistory
} from '../services/historyService.js';
import { containsProfanity } from '../utils/profanityFilter.js';
import IntelligentCache from '../utils/cache/intelligentCache.js';
import {CacheKeys, invalidateFriendRequestCaches, invalidateNicknameCaches} from '../utils/cache/cacheKeys.js';
import { checkAndLogAccess } from '../utils/logUtils.js';

// 총 유저 수 함수
export const getUserCountController = async (req, res) => {
    try {
        const count = await User.countDocuments();
        return res.status(200).json({ success: true, count });
    } catch (error) {
        console.error("getUserCount error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};


// 성별별 유저 수 함수
export const getGenderCountController = async (req, res) => {
    try {
        const maleCount   = await User.countDocuments({ gender: "male"   });
        const femaleCount = await User.countDocuments({ gender: "female" });
        return res.status(200).json({
            success: true,
            male:   maleCount,
            female: femaleCount
        });
    } catch (error) {
        console.error("getGenderCount error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};


// 소셜 성별별 유저 수 함수
export const getSocialGenderCountController = async (req, res) => {
    try {
        // 오직 social 안의 kakao.gender, naver.gender 만 사용
        const users = await User.find(
            {},
            "social.kakao.gender social.naver.gender"
        ).lean();

        let male = 0;
        let female = 0;

        users.forEach(u => {
            let g = null;

            // 1) 카카오 social gender 우선
            if (u.social?.kakao?.gender) {
                g = u.social.kakao.gender;       // 'male' | 'female' | ''
            }
            // 2) 없으면 네이버 social gender
            else if (u.social?.naver?.gender) {
                if (u.social.naver.gender === "M")      g = "male";
                else if (u.social.naver.gender === "F") g = "female";
            }

            if (g === "male")   male++;
            else if (g === "female") female++;
        });

        return res.status(200).json({ success: true, male, female });
    } catch (error) {
        console.error("getSocialGenderCount error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};


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
export const updateUserProfile = async (req, res) => {
    const { userId } = req.params;
    const updateData = req.body;

    // ✅ 권한 체크
    if (req.user._id.toString() !== userId) {
        return res.status(403).json({
            success: false,
            message: '본인의 프로필만 수정할 수 있습니다.'
        });
    }

    try {


        if (updateData.info && containsProfanity(updateData.info)) {
            return res.status(400).json({ message: '자기소개에 비속어를 사용할 수 없습니다.' });
            }

        // 현재 사용자 정보 조회
        const currentUser = await User.findById(userId)
            .select('nickname gender info lolNickname')
            .lean();  // ✅ Mongoose 오버헤드 제거

        if (!currentUser) {
            return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
        }

        // 닉네임 변경 제한 체크 (하루 1회)
        if (updateData.nickname && updateData.nickname !== currentUser.nickname) {
        const todayNicknameChangeCount = await getTodayNicknameChangeCount(userId);
        
        if (todayNicknameChangeCount >= 1) {
        const lastChangeTime = await getLastNicknameChangeTime(userId);
        const lastChangeDate = lastChangeTime ? new Date(lastChangeTime).toLocaleDateString('ko-KR') : '알 수 없음';
            
                return res.status(400).json({ 
                    message: `닉네임은 하루에 1회만 변경 가능합니다. 마지막 변경일: ${lastChangeDate}`,
                    lastChangeTime: lastChangeTime
            });
        }
        }
        
        // 성별 변경 제한 체크 (하루 1회)
        if (updateData.gender && updateData.gender !== currentUser.gender) {
            const todayGenderChangeCount = await getTodayGenderChangeCount(userId);
            
            if (todayGenderChangeCount >= 1) {
                const lastChangeTime = await getLastGenderChangeTime(userId);
                const lastChangeDate = lastChangeTime ? new Date(lastChangeTime).toLocaleDateString('ko-KR') : '알 수 없음';
                
                return res.status(400).json({ 
                    message: `성별은 하루에 1회만 변경 가능합니다. 마지막 변경일: ${lastChangeDate}`,
                    lastChangeTime: lastChangeTime
                });
            }
        }

        // 사용자 정보 업데이트
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updateData,
            {
                new: true,
                runValidators: true,
                select: '_id nickname info gender lolNickname suddenNickname battleNickname profilePhoto photo coinLeft star'
            }
        );

        // ✅ 경량 응답: 프론트에 필요한 필드만 선택
        const lightResponse = {
            _id: updatedUser._id,
            nickname: updatedUser.nickname,
            info: updatedUser.info,
            gender: updatedUser.gender,
            lolNickname: updatedUser.lolNickname,
            suddenNickname: updatedUser.suddenNickname,
            battleNickname: updatedUser.battleNickname,
            profilePhoto: updatedUser.profilePhoto,
            photo: updatedUser.photo,
            coinLeft: updatedUser.coinLeft,
            star: updatedUser.star
        };


        await IntelligentCache.invalidateUserStaticInfo(userId);
        await IntelligentCache.invalidateUserCache(userId);
        console.log(`✅ [캐시 무효화] 프로필 업데이트: ${userId}`);

        // 🔥 추가: 프로필 편집용 캐시도 명시적으로 삭제
        await IntelligentCache.deleteCache(`user_profile_edit_${userId}`);
        await IntelligentCache.deleteCache(`user_minimal_${userId}`);
        await IntelligentCache.deleteCache(`user_profile_full_${userId}`);

        console.log(`✅ [캐시 무효화 완료] 프로필 업데이트: ${userId}`);

        // ⭐ 닉네임 또는 성별 변경 시 캐시 무효화
        // ⭐ 닉네임 또는 성별 변경 시 캐시 무효화
        if (updateData.nickname && updateData.nickname !== currentUser.nickname) {
            // 🆕 추가: 기존 닉네임 캐시 삭제
            await IntelligentCache.deleteCache(`user_nickname_${currentUser.nickname}`);
            console.log(`🗑️ [캐시 무효화] 이전 닉네임: ${currentUser.nickname}`);

            // 🆕 추가: 혹시 모를 새 닉네임 캐시도 삭제 (예: 다른 사람이 검색했던 경우)
            await IntelligentCache.deleteCache(`user_nickname_${updateData.nickname}`);
            console.log(`🗑️ [캐시 무효화] 새 닉네임: ${updateData.nickname}`);

            // 기존 코드
            await IntelligentCache.deleteCache(`change_availability_${userId}`);
            console.log(`🗑️ [캐시 무효화] 닉네임 변경 가능 여부: ${userId}`);

            await invalidateNicknameCaches(
                IntelligentCache,
                currentUser.nickname,
                updateData.nickname
            );

        }

        if (updateData.gender && updateData.gender !== currentUser.gender) {
            await IntelligentCache.deleteCache(`change_availability_${userId}`);
            console.log(`🗑️ [캐시 무효화] 성별 변경: ${userId}`);
        }

        // 히스토리 저장
        if (updateData.nickname && updateData.nickname !== currentUser.nickname) {
        await saveNicknameHistory(
        userId,
        currentUser.nickname,
        updateData.nickname,
        'user_change',
        userId,
        req
        );
            console.log(`닉네임 변경: ${currentUser.nickname} → ${updateData.nickname}`);
        }
        
        if (updateData.gender && updateData.gender !== currentUser.gender) {
        await saveGenderHistory(
        userId,
        currentUser.gender,
        updateData.gender,
        'user_change',
        userId,
            req
            );
            console.log(`성별 변경: ${currentUser.gender} → ${updateData.gender}`);
        }

        res.status(200).json({
            user: lightResponse
        });

    } catch (error) {
        console.error('프로필 업데이트 실패:', error);
        res.status(400).json({ message: error.message || '프로필 업데이트 중 오류가 발생했습니다.' });
    }
};




export const rateUserController = async (req, res) => {
    const { userId } = req.params;
    const { rating } = req.body;
    const evaluatorId = req.user._id.toString();

    console.log(`📊 [매너평가] ${evaluatorId} → ${userId} (점수: ${rating})`);

    // ✅ 특수 케이스: 다른 사람을 평가하는 것이므로
    // 평가하는 사람(req.user)과 평가받는 사람(userId)이 다를 수 있음
    // 하지만 자기 자신을 평가하는 것은 막아야 함
    if (evaluatorId === userId) {
        console.warn(`⚠️ [매너평가] 자기 평가 시도: ${evaluatorId}`);
        return res.status(403).json({
            success: false,
            message: '자기 자신은 평가할 수 없습니다.'
        });
    }

    try {

        await rateUser(userId, rating);
        console.log(`✅ [매너평가 성공] ${userId}`);
        res.status(204).send();  // ✅ No Content (응답 본문 없음)
    } catch (error) {
        console.error(`❌ [매너평가 실패] ${userId}:`, error.message);
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
    const { userId } = req.params;
    // ✅ 권한 체크
    if (req.user._id.toString() !== userId) {
        return res.status(403).json({
            success: false,
            message: '본인의 채팅 횟수만 감소할 수 있습니다.'
        });
    }

    try {

        const result  = await decrementChatCount(userId);

        res.status(200).json(result);

    } catch (error) {
        console.error(`❌ [decrementChatCountController] 오류: ${req.params.userId}`, error);
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
};



export const acceptFriendRequestController = async (req, res) => {
    const { requestId } = req.body; // 클라이언트에서 친구 요청 ID를 전달받음

    // ✅ 권한 체크는 서비스 레이어에서 수행
    // (요청을 받은 사람인지 확인 필요 - requestId로 조회 후 확인)

    // ✅ 1. requestId 존재 확인
    if (!requestId) {
        return res.status(400).json({ error: 'requestId는 필수입니다.' });
    }

    // ✅ 2. ObjectId 형식 검증
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({ error: '잘못된 requestId 형식입니다.' });
    }



    try {

        // FriendRequest 조회로 receiver 확인
        const friendRequest = await FriendRequest.findById(requestId);

        if (!friendRequest) {
            return res.status(404).json({ error: '친구 요청을 찾을 수 없습니다.' });
        }

        // receiver인지 확인
        if (friendRequest.receiver.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                error: '본인에게 온 친구 요청만 수락할 수 있습니다.'
            });
        }

        const result = await acceptFriendRequestService(requestId);
        res.status(200).json(result.friend);
        // res.status(200).json({
        //     success: true,
        //     message: "친구 요청을 수락하였으며, 친구 목록에 추가되었습니다.",
        //     data: {
        //         friend: result.friend  // ✅ populate된 친구 정보
        //     }
        // });
    } catch (error) {
        res.status(400).json({ error: error.message });
        // res.status(400).json({
        //     success: false,
        //     message: error.message
        // });
    }
};



// 친구 요청 보내기 컨트롤러
export const sendFriendRequestController = async (req, res) => {
    const { senderId, receiverId } = req.body;

    // ✅ 권한 체크: 본인만 친구 요청을 보낼 수 있음
    if (req.user._id.toString() !== senderId) {
        return res.status(403).json({
            success: false,
            message: '본인만 친구 요청을 보낼 수 있습니다.'
        });
    }

    try {
        // 친구 요청 생성
        const { request, senderNickname } = await sendFriendRequest(senderId, receiverId);
        // 보낸 유저의 정보를 가져와 닉네임을 조회
        // const senderUser = await getUserById(senderId);


        // await invalidateFriendRequestCaches(IntelligentCache, receiverId);//(서비스에서 사용중)

        // 보낸 유저의 닉네임을 포함하여 알림 전송
        io.to(receiverId).emit('friendRequestNotification', {

            type: 'FRIEND_REQUEST',
            requestId: request._id.toString(),
            senderId: senderId,
            senderNickname: senderNickname,
            message: `${senderNickname}님이 친구 요청을 보냈습니다.`,
            friendRequest: request,
            sender: {
                _id: senderId,
                nickname: senderNickname
            }
        });

        console.log('📡 [Socket] 친구 요청 알림 전송:', {
            receiverId,
            requestId: request._id,
            senderNickname,
            timestamp: new Date().toISOString()
        });

        res.status(200).json({
            success: true,
            message: "친구 요청을 보냈습니다.",
            // data: request
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

    // ✅ 권한 체크
    if (req.user._id.toString() !== userId) {
        return res.status(403).json({
            success: false,
            message: '본인의 친구 요청만 조회할 수 있습니다.'
        });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 [Controller] 친구 요청 목록 조회 시작:', {
        userId,
        timestamp: new Date().toISOString()
    });

    try {
        const requests = await getFriendRequests(userId);

        console.log('✅ [Controller] 서비스 응답:', {
            타입: typeof requests,
            isArray: Array.isArray(requests),
            길이: requests?.length,
            내용: requests?.map(r => ({
                id: r._id,
                senderNickname: r.sender?.nickname
            })),
            timestamp: new Date().toISOString()
        });

        console.log('📤 [Controller] 클라이언트에 전송:', {
            success: true,
            dataLength: requests?.length
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        res.status(200).json({
            success: true,
            data: requests
        });
    } catch (error) {
        console.error('❌ [Controller] 실패:', {
            에러: error.message,
            스택: error.stack,
            timestamp: new Date().toISOString()
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};


// ✅✅✅ 여기에 새로운 함수 추가! ✅✅✅
/**
 * 친구 요청 개수만 조회 (최적화)
 * GET /api/user/:userId/friend-requests/count
 */
export const getFriendRequestCountController = async (req, res) => {
    const { userId } = req.params;

    // ✅ 권한 체크
    if (req.user._id.toString() !== userId) {
        return res.status(403).json({
            success: false,
            message: '본인의 정보만 조회할 수 있습니다.'
        });
    }

    console.log('📊 [Controller-개수] 조회 시작:', {
        userId,
        timestamp: new Date().toISOString()
    });


    try {
        console.log(`📊 [친구 요청 개수 조회] userId: ${userId}`);

        // ✅ countDocuments - find()보다 10배 빠름!
        const count = await FriendRequest.countDocuments({
            receiver: userId,
            status: 'pending'
        });

        console.log('✅ [Controller-개수] DB 응답:', {
            count,
            timestamp: new Date().toISOString()
        });

        res.status(200).json({
            success: true,
            count
        });
    } catch (error) {
        console.error(`❌ [친구 요청 개수 조회 실패]`, error);
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

        const friendRequest = await FriendRequest.findById(requestId);

        if (!friendRequest) {
            return res.status(404).json({
                success: false,
                message: '친구 요청을 찾을 수 없습니다.'
            });
        }

        // ⭐ 2. receiver인지 확인
        if (friendRequest.receiver.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: '본인에게 온 친구 요청만 거절할 수 있습니다.'
            });
        }

        const result = await declineFriendRequestService(requestId);
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



// 친구 삭제 컨트롤러
export const deleteFriendController = async (req, res) => {
    const { userId, friendId } = req.params;

    // ✅ 권한 체크
    if (req.user._id.toString() !== userId) {
        return res.status(403).json({
            success: false,
            message: '본인의 친구만 삭제할 수 있습니다.'
        });
    }

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

// /**
//  * 사용자 차단
//  */
// export const blockUserController = async (req, res) => {
//     const { userId, targetUserId } = req.params;
//     try {
//         const updated = await blockUserService(userId, targetUserId);
//         // 📌 추가: 차단 관련 캐시 무효화
//         await IntelligentCache.deleteCache(`user_blocks_${userId}`);
//         await IntelligentCache.deleteCache(`users_blocked_me_${targetUserId}`);
//         console.log(`🗑️ [캐시 무효화] 차단: ${userId} -> ${targetUserId}`);
//
//         res.status(200).json({ success: true, data: updated.blockedUsers });
//     } catch (err) {
//         res.status(400).json({ success: false, message: err.message });
//     }
// };
//
// /**
//  * 차단 해제
//  */
// export const unblockUserController = async (req, res) => {
//     const { userId, targetUserId } = req.params;
//     try {
//         const updated = await unblockUserService(userId, targetUserId);
//         // 📌 추가: 차단 해제 관련 캐시 무효화
//         await IntelligentCache.deleteCache(`user_blocks_${userId}`);
//         await IntelligentCache.deleteCache(`users_blocked_me_${targetUserId}`);
//         console.log(`🗑️ [캐시 무효화] 차단 해제: ${userId} -> ${targetUserId}`);
//
//         res.status(200).json({ success: true, data: updated.blockedUsers });
//     } catch (err) {
//         res.status(400).json({ success: false, message: err.message });
//     }
// };

/**
 * 차단 목록 조회
 */
export const getBlockedUsersController = async (req, res) => {
    const { userId } = req.params;

    // ✅ 권한 체크
    if (req.user._id.toString() !== userId) {
        return res.status(403).json({
            success: false,
            message: '본인의 차단 목록만 조회할 수 있습니다.'
        });
    }

    if (req.user._id.toString() !== userId) {
        return res.status(403).json({
            success: false,
            message: '본인의 차단 목록만 조회할 수 있습니다.'
        });
    }

    try {
        const blocked = await getBlockedUsersService(userId);
        res.status(200).json({ success: true, blockedUsers: blocked });
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
    const online = req.query.online; // Add this line

    // ✅ 권한 체크
    if (req.user._id.toString() !== userId) {
        return res.status(403).json({
            success: false,
            message: '본인의 친구 목록만 조회할 수 있습니다.'
        });
    }

    try {
        const data = await getPaginatedFriends(userId, offset, limit, online); // Pass it to the service
        res.status(200).json({ success: true, ...data });
    } catch (e) {
        res.status(400).json({ success: false, message: e.message });
    }
};

// 알림 설정 변경 (PATCH /:userId/prefs)
export const updateUserPrefsController = async (req, res) => {
    const { userId } = req.params;
    const { friendReqEnabled, chatPreviewEnabled, wordFilterEnabled } = req.body; // ✅ wordFilterEnabled 추가

    // ✅ 권한 체크
    if (req.user._id.toString() !== userId) {
        return res.status(403).json({
            success: false,
            message: '본인의 설정만 변경할 수 있습니다.'
        });
    }

    try {
        // ✅ 업데이트할 데이터 객체 생성
        const updateData = {};
        if (typeof friendReqEnabled === 'boolean') {
            updateData.friendReqEnabled = friendReqEnabled;
        }
        if (typeof chatPreviewEnabled === 'boolean') {
            updateData.chatPreviewEnabled = chatPreviewEnabled;
        }
        if (typeof wordFilterEnabled === 'boolean') { // ✅ 추가
            updateData.wordFilterEnabled = wordFilterEnabled;
        }

        // ✅ 업데이트 실행
        const updated = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: false , select: 'friendReqEnabled chatPreviewEnabled wordFilterEnabled' } // ✅ 필드 추가
        );

        if (!updated) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // 2. 만약 알림 설정이 꺼진다면, pending 상태의 친구요청을 삭제
        if (friendReqEnabled === false) {
            await FriendRequest.deleteMany({ receiver: userId, status: 'pending' });
        }

        // 3. 응답 반환
        return res.status(200).json({ success: true});

    } catch (e) {
        return res.status(400).json({ success: false, message: e.message });
    }
};

// 닉네임 중복 체크 컨트롤러
export const checkNicknameController = async (req, res) => {
    try {
        const { nickname } = req.params;
        const { userId } = req.query; // 수정 시 자신의 ID는 제외하기 위함

        // 욕설 필터링 추가
        if (containsProfanity(nickname)) {
            return res.status(400).json({
                available: false,
                message: '비속어는 닉네임으로 사용할 수 없습니다.'
            });
        }

        console.log('닉네임 중복 체크:', nickname, 'userId:', userId);

        if (!nickname || nickname.trim() === '') {
            return res.status(400).json({
                available: false,
                message: '닉네임을 입력해주세요.'
            });
        }

        // 닉네임 길이 체크 (2-12자)
        if (nickname.length < 2 || nickname.length > 12) {
            return res.status(400).json({
                available: false,
                message: '닉네임은 2-12자로 입력해주세요.'
            });
        }

        // 특수문자 체크 (한글, 영문, 숫자, 일부 특수문자만 허용)
        const nicknameRegex = /^[가-힣a-zA-Z0-9._-]+$/;
        if (!nicknameRegex.test(nickname)) {
            return res.status(400).json({
                available: false,
                message: '닉네임에는 한글, 영문, 숫자, ., _, - 만 사용 가능합니다.'
            });
        }

        // 금지어 체크 (필요시 추가)
        const forbiddenWords = ['관리자', 'admin', 'root', 'system'];
        const lowerNickname = nickname.toLowerCase();
        if (forbiddenWords.some(word => lowerNickname.includes(word))) {
            return res.status(400).json({
                available: false,
                message: '사용할 수 없는 닉네임입니다.'
            });
        }


        // 캐시 확인 (⭐ 새로 추가된 부분!)


        const cacheKey = CacheKeys.NICKNAME_AVAILABLE(nickname);
        const cached = await IntelligentCache.getCache(cacheKey);

        if (cached !== null) {
            // 캐시 HIT: DB 조회 생략!
            const cacheType = IntelligentCache.client ? 'Redis' : 'Memory';
            console.log(`💾 [${cacheType} HIT] 닉네임 캐시: "${nickname}"`);

            return res.json({
                available: cached.available,
                message: cached.message
            });
        }


        // DB에서 중복 체크
        const cacheType = IntelligentCache.client ? 'Redis' : 'Memory';
        console.log(`🔍 [${cacheType} MISS] 닉네임: "${nickname}" → DB 조회`);

        const existingUser = await User.findOne({ nickname })
            .select('_id')  // ⭐ _id 필드만 선택
            .lean();        // ⭐ Plain JavaScript Object 반환

        //  결과 처리 및 캐싱
        if (existingUser) {
            // 수정 시 자신의 닉네임인 경우는 사용 가능
            if (userId && existingUser._id.toString() === userId) {
                return res.json({
                    available: true,
                    message: '현재 사용 중인 닉네임입니다.'
                });
            }

            // 다른 사용자가 사용 중인 닉네임인 경우
            return res.json({
                available: false,
                message: '현재 사용 중인 닉네임입니다.'
            });
        }

        // 사용 가능한 닉네임 - 30분간 캐싱!
        const response = {
            available: true,
            message: '사용 가능한 닉네임입니다.'
        };

        await IntelligentCache.setCache(cacheKey, response, 1800); // 30분 TTL
        console.log(`✅ 캐시 저장: ${cacheKey} (TTL: 30분)`);

        return res.json(response);

    } catch (error) {
        console.error('닉네임 중복 체크 에러:', error);
        return res.status(500).json({
            available: false,
            message: '서버 오류가 발생했습니다.'
        });
    }
};

// 닉네임 히스토리 조회 컨트롤러
export const getNicknameHistoryController = async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 50 } = req.query;

        // ✅ 권한 체크
        if (req.user._id.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: '본인의 히스토리만 조회할 수 있습니다.'
            });
        }

        const history = await getNicknameHistory(userId, parseInt(limit));

        res.status(200).json({
            message: '닉네임 히스토리 조회 성공',
            data: history
        });
    } catch (error) {
        console.error('닉네임 히스토리 조회 실패:', error);
        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
};

// 성별 히스토리 조회 컨트롤러
export const getGenderHistoryController = async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 50 } = req.query;

        const history = await getGenderHistory(userId, parseInt(limit));

        res.status(200).json({
            message: '성별 히스토리 조회 성공',
            data: history
        });
    } catch (error) {
        console.error('성별 히스토리 조회 실패:', error);
        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
};

// 변경 가능 여부 확인 컨트롤러
export const checkChangeAvailabilityController = async (req, res) => {
    const { userId } = req.params;

    // ✅ 권한 체크
    if (req.user._id.toString() !== userId) {
        return res.status(403).json({
            success: false,
            message: '본인의 정보만 조회할 수 있습니다.'
        });
    }

    try {

        const cacheKey = `change_availability_${userId}`;

        // ⭐ 1️⃣ 캐시 확인
        let cached = await IntelligentCache.getCache(cacheKey);
        if (cached) {
            const cacheType = IntelligentCache.client ? 'Redis' : 'Memory';
            console.log(`💾 [${cacheType} HIT] 변경 가능 여부: ${userId}`);

            return res.status(200).json({
                message: '변경 가능 여부 조회 성공',
                data: cached
            });
        }

        // ⭐ 2️⃣ 캐시 MISS: DB 조회
        const cacheType = IntelligentCache.client ? 'Redis' : 'Memory';
        console.log(`🔍 [${cacheType} MISS] 변경 가능 여부: ${userId} → DB 조회`);
        
        const [
            todayNicknameCount,
            todayGenderCount,
            lastNicknameChangeTime,
            lastGenderChangeTime
        ] = await Promise.all([
            getTodayNicknameChangeCount(userId),
            getTodayGenderChangeCount(userId),
            getLastNicknameChangeTime(userId),
            getLastGenderChangeTime(userId)
        ]);
        
        // 다음 날 시작 시간 계산
        const getNextDayStart = () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            return tomorrow;
        };

        const responseData = {
            nickname: {
                canChange: todayNicknameCount < 1,
                // todayChangeCount: todayNicknameCount,
                lastChangeTime: lastNicknameChangeTime,
                // nextAvailableTime: todayNicknameCount >= 1 ? getNextDayStart() : null
            },
            gender: {
                canChange: todayGenderCount < 1,
                // todayChangeCount: todayGenderCount,
                lastChangeTime: lastGenderChangeTime,
                // nextAvailableTime: todayGenderCount >= 1 ? getNextDayStart() : null
            }
        };

        // ⭐ 3️⃣ Redis 캐싱 (TTL 5분)
        await IntelligentCache.setCache(cacheKey, responseData, 21600);
        console.log(`✅ 캐시 저장: ${cacheKey} (TTL: 6시간)`);

        res.status(200).json({
            message: '변경 가능 여부 조회 성공',
            data: responseData
        });
    } catch (error) {
        console.error('변경 가능 여부 확인 실패:', error);
        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
};

export const deactivateUser = async (req, res) => {
    try {
        const userId = req.user._id;

        // ✅ 🆕 추가: 탈퇴 전 마지막 접속 로그 기록
        // (isCriticalAction으로 무조건 저장됨)
        await checkAndLogAccess(
            userId.toString(),
            req.ip,
            'withdraw',
            req.headers['user-agent']
        );
        
        const result = await deactivateUserService(userId);
        // Clear cookies on the client side upon successful deactivation
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        res.status(200).json({ success: true, message: "회원 탈퇴가 완료되었습니다.", data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const reactivateUser = async (req, res) => {
    try {
        const { userId } = req.body; // The user ID to reactivate
        const user = await reactivateUserService(userId);
        
        // After reactivation, log the user in by issuing tokens
        const payload = {
            userId:  user._id,
            // You might need to get kakaoId or naverId if they exist
            name:    user.name,
        };

        const accessToken  = jwt.sign(payload, process.env.JWT_SECRET,     { expiresIn: "2h" });
        const refreshToken = jwt.sign(payload, process.env.REFRESH_SECRET, { expiresIn: "7d" });

        const cookieOptions = {
            httpOnly: true,
            secure:   process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path:     "/",
        };

        res
            .cookie('accessToken',  accessToken,  { ...cookieOptions, maxAge: 2 * 60 * 60 * 1000}) // 2 hours
            .cookie('refreshToken', refreshToken, { ...cookieOptions , maxAge: 7*24*60*60*1000 })
            .json({
                message:     "계정이 성공적으로 재활성화되었습니다.",
                status:      "success",
                user,
            });

    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const archiveAndPrepareNewController = async (req, res) => {
    try {
        const { userId } = req.body;
        const result = await archiveAndPrepareNew(userId);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * 욕설 필터 설정 업데이트 (만 19세 이상만 가능)
 * PATCH /api/users/:userId/word-filter
 */
export const updateWordFilter = async (req, res) => {
    try {
        const { userId } = req.params;
        const { wordFilterEnabled } = req.body;
        
        // 사용자 조회
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: '사용자를 찾을 수 없습니다.' 
            });
        }
        
        // 나이 확인 (19세 이상만)
        if (!user.calculatedAge || user.calculatedAge < 19) {
            return res.status(403).json({ 
                success: false,
                error: '만 19세 이상만 설정할 수 있습니다.',
                isMinor: true
            });
        }
        
        // 설정 업데이트
        user.wordFilterEnabled = wordFilterEnabled;
        await user.save();
        
        res.json({ 
            success: true, 
            wordFilterEnabled: user.wordFilterEnabled 
        });
    } catch (error) {
        console.error('욕설 필터 설정 업데이트 실패:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};