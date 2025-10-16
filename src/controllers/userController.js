// controllers/userController.js
import {
    acceptFriendRequestService, blockUserService, declineFriendRequestService,
    decrementChatCount, deleteFriend, getBlockedUsersService, getFriendRequests, getPaginatedFriends,
    getUserById,
    getUserByNickname, sendFriendRequest, unblockUserService,
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
    try {
        const { userId } = req.params;
        const updateData = req.body;

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
        const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
            new: true,
            runValidators: true
        });

        await IntelligentCache.invalidateUserStaticInfo(userId);
        await IntelligentCache.invalidateUserCache(userId);
        console.log(`✅ [캐시 무효화] 프로필 업데이트: ${userId}`);

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
            message: '프로필이 성공적으로 업데이트되었습니다.',
            user: updatedUser
        });

    } catch (error) {
        console.error('프로필 업데이트 실패:', error);
        res.status(400).json({ message: error.message || '프로필 업데이트 중 오류가 발생했습니다.' });
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
        const result = await deleteFriend(userId, friendId, io);
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
        // 📌 추가: 차단 관련 캐시 무효화
        await IntelligentCache.deleteCache(`user_blocks_${userId}`);
        await IntelligentCache.deleteCache(`users_blocked_me_${targetUserId}`);
        console.log(`🗑️ [캐시 무효화] 차단: ${userId} -> ${targetUserId}`);

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
        // 📌 추가: 차단 해제 관련 캐시 무효화
        await IntelligentCache.deleteCache(`user_blocks_${userId}`);
        await IntelligentCache.deleteCache(`users_blocked_me_${targetUserId}`);
        console.log(`🗑️ [캐시 무효화] 차단 해제: ${userId} -> ${targetUserId}`);

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
            { new: true, select: 'friendReqEnabled chatPreviewEnabled wordFilterEnabled' } // ✅ 필드 추가
        );

        if (!updated) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // 2. 만약 알림 설정이 꺼진다면, pending 상태의 친구요청을 삭제
        if (friendReqEnabled === false) {
            await FriendRequest.deleteMany({ receiver: userId, status: 'pending' });
        }

        // 3. 응답 반환
        return res.status(200).json({ success: true, data: updated });

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

        // DB에서 중복 체크
        const existingUser = await User.findOne({ nickname });

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

        return res.json({
            available: true,
            message: '사용 가능한 닉네임입니다.'
        });

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
    try {
        const { userId } = req.params;
        
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
        
        res.status(200).json({
            message: '변경 가능 여부 조회 성공',
            data: {
                nickname: {
                    canChange: todayNicknameCount < 1,
                    todayChangeCount: todayNicknameCount,
                    lastChangeTime: lastNicknameChangeTime,
                    nextAvailableTime: todayNicknameCount >= 1 ? getNextDayStart() : null
                },
                gender: {
                    canChange: todayGenderCount < 1,
                    todayChangeCount: todayGenderCount,
                    lastChangeTime: lastGenderChangeTime,
                    nextAvailableTime: todayGenderCount >= 1 ? getNextDayStart() : null
                }
            }
        });
    } catch (error) {
        console.error('변경 가능 여부 확인 실패:', error);
        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
};

export const deactivateUser = async (req, res) => {
    try {
        const userId = req.user._id;
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