// src/services/userService.js
import {normalizeBirthdate} from "../utils/normalizeBirthdate.js";
import {normalizePhoneNumber} from "../utils/normalizePhoneNumber.js";
import { User } from '../models/UserProfile.js';
import {FriendRequest} from "../models/FriendRequest.js";
import {getMax, rechargeIfNeeded, REFILL_MS} from "../utils/chatQuota.js";
import * as onlineStatusService from "./onlineStatusService.js";

/**
 * findUserOrNoUser
 * - 카카오 소셜 로그인으로부터 받은 사용자 데이터를 기반으로
 *   UserProfile 컬렉션에서 해당 사용자를 조회합니다.
 * - 사용자가 존재하면 해당 UserProfile 문서를 반환하고,
 *   존재하지 않으면 { status: 'noUser', ...kakaoUserData } 형태의 객체를 반환합니다.
 *
 * @param {Object} kakaoUserData - 카카오에서 받은 사용자 정보
 * @param {number} kakaoUserData.kakaoId - 카카오 고유 사용자 ID
 * @param {string} kakaoUserData.nickname - 카카오에서 받은 닉네임
 * @param {string} kakaoUserData.profileImage - 카카오에서 받은 프로필 이미지 URL
 * @param {string} kakaoUserData.email - 카카오에서 받은 이메일 주소
 * @returns {Promise<Object>} - 기존 사용자(UserProfile 문서) 또는 회원가입 필요 상태 객체
 * @throws {Error} - DB 작업 중 오류 발생 시 에러를 던집니다.
 */
export const findUserOrNoUser = async (kakaoUserData) => {
    try {
        // DB에서 'social.kakao.providerId' 필드를 기준으로 카카오 사용자 조회
        const normalizedBirthdate = normalizeBirthdate(kakaoUserData.birthyear, kakaoUserData.birthday);
        const normalizedPhone = normalizePhoneNumber(kakaoUserData.phoneNumber);
        console.log("DEBUG: 카카오 데이터 - 이름:", kakaoUserData.name,
            "전화번호:", normalizedPhone,
            "원본 birthday:", kakaoUserData.birthday,
            "Normalized Birthdate:", normalizedBirthdate);

        // 네이버 providerId로 먼저 검색
        let existingUser = await User.findOne({ 'social.kakao.providerId': kakaoUserData.kakaoId });
        console.log("DEBUG: DB에서 카카오 providerId로 조회 결과:", existingUser);

        // 만약 네이버 providerId가 없는 경우, 공통 식별자 기준으로 검색
        if (!existingUser && kakaoUserData.name && normalizedPhone && normalizedBirthdate) {
            console.log("DEBUG: 카카오 providerId로 사용자가 없으므로, 공통 식별자(이름, 전화번호, 생년월일)로 조회합니다:", {
                name: kakaoUserData.name,
                phone: normalizedPhone,
                birthdate: normalizedBirthdate,
            });
            existingUser = await User.findOne({
                name: kakaoUserData.name,
                phone: normalizedPhone,
                birthdate: normalizedBirthdate,
            });
            console.log("DEBUG: 공통 식별자로 조회한 결과:", existingUser);
            // 3. 조회된 계정에 카카오 정보가 없다면 병합 처리
            if (existingUser && (!existingUser.social.kakao || !existingUser.social.kakao.providerId)) {
                console.log("DEBUG: 병합 전 기존 사용자의 소셜 정보:", existingUser.social);
                existingUser.social.kakao = {
                    providerId: kakaoUserData.kakaoId,
                    name: kakaoUserData.name,
                    phoneNumber: kakaoUserData.phoneNumber,
                    birthday: kakaoUserData.birthday,
                    birthyear: kakaoUserData.birthyear,
                    gender: kakaoUserData.gender,
                };
                existingUser.markModified('social');  // 변경사항 수동 등록
                await existingUser.save();
                console.log("기존 계정에 카카오 정보 병합 완료");
                console.log("DEBUG: 병합 후 사용자 정보:", existingUser);
            }
        }

        // 등록된 사용자가 없으면 로그 출력 후 회원가입 필요 상태 객체 반환
        if (!existingUser) {
            console.log('등록된 사용자가 없습니다. 회원가입이 필요합니다.'); // 오류헨들링코드
            return { status: 'noUser', ...kakaoUserData };
        }

        // 등록된 사용자가 있으면 해당 사용자 객체를 반환
        return existingUser;
    } catch (error) { // 오류헨들링코드
        console.error('User service error:', error.message);
        throw error;
    }
};

// 네이버 사용자 조회 함수 추가
export const findUserByNaver = async (naverUserData) => {
    try {
        const normalizedBirthdate = normalizeBirthdate(naverUserData.birthyear, naverUserData.birthday);
        const normalizedPhone = normalizePhoneNumber(naverUserData.phoneNumber);
        console.log("DEBUG: 네이버 데이터 - 이름:", naverUserData.name,
            "전화번호:", normalizedPhone,
            "원본 birthday:", naverUserData.birthday,
            "Normalized Birthdate:", normalizedBirthdate);

        let existingUser = await User.findOne({ 'social.naver.providerId': naverUserData.naverId });
        console.log("DEBUG: DB에서 네이버 providerId로 조회 결과:", existingUser);

        if (!existingUser && naverUserData.name && normalizedPhone && normalizedBirthdate) {
            console.log("DEBUG: 네이버 providerId로 사용자가 없으므로, 공통 식별자(이름, 전화번호, 생년월일)로 조회합니다:", {
                name: naverUserData.name,
                phone: normalizedPhone,
                birthdate: normalizedBirthdate,
            });
            existingUser = await User.findOne({
                name: naverUserData.name,
                phone: normalizedPhone,
                birthdate: normalizedBirthdate,
            });

            // 3. 조회된 계정에 네이버 정보가 없다면 병합 처리
            if (existingUser && (!existingUser.social.naver || !existingUser.social.naver.providerId)) {
                console.log("DEBUG: 병합 전 기존 사용자의 소셜 정보:", existingUser.social);
                existingUser.social.naver = {
                    providerId: naverUserData.naverId,
                    name: naverUserData.name,
                    phoneNumber: naverUserData.phoneNumber,
                    birthday: naverUserData.birthday,
                    birthyear: naverUserData.birthyear,
                    gender: naverUserData.gender,
                };
                existingUser.markModified('social');  // 변경사항 수동 등록
                await existingUser.save();
                console.log("기존 계정에 네이버 정보 병합 완료");
                console.log("DEBUG: 병합 후 사용자 정보:", existingUser);
            }
        }

        if (!existingUser) {
            console.log('등록된 네이버 사용자가 없습니다. 회원가입이 필요합니다.');
            return { status: 'noUser', ...naverUserData };
        }
        return existingUser;
    } catch (error) {
        console.error('User service error:', error.message);
        throw error;
    }
};

// 유저 정보를 불러오는 서비스 함수
export const getUserById = async (userId) => {
    try {
        let user = await User.findById(userId);
        if (!user) throw new Error("사용자를 찾을 수 없습니다.");

        user = await rechargeIfNeeded(user);                 // 자동 충전

        const maxChatCount = getMax(user.plan?.planType);    // 플랜별 최대
        const last = user.chatTimer ?? new Date();           // 마지막 충전 시각
        const nextRefillAt = new Date(new Date(last).getTime() + REFILL_MS);

        const data = user.toObject();
        data.maxChatCount = maxChatCount;
        data.nextRefillAt = nextRefillAt;                    // ISO 문자열
        return data;
    } catch (err) {
        throw new Error(err.message);
    }
};

export const rateUser = async (userId, rating) => {
    // rating 값 검증: 숫자이고 0 이상 5 이하인지 확인
    if (typeof rating !== "number" || rating < 0 || rating > 5) {
        throw new Error("Rating must be a number between 0 and 5.");
    }

    // 해당 사용자를 DB에서 찾기
    const user = await User.findById(userId);
    if (!user) {
        throw new Error("User not found.");
    }

    // 기존 별점에 전달받은 rating 값을 누적 업데이트
    user.star += rating;

    // 변경사항 저장
    await user.save();

    return user;
};

/**
 * 별칭을 이용하여 사용자를 조회하는 함수
 * @param {string} nickname - 사용자의 별칭
 * @returns {Promise<Object>} 해당 사용자의 UserProfile 문서
 */
export const getUserByNickname = async (nickname) => {
    try {
        const user = await User.findOne({ nickname });
        if (!user) {
            throw new Error("User not found.");
        }
        return user;
    } catch (error) {
        throw new Error(error.message);
    }
};

// 채팅 횟수 감소
export const decrementChatCount = async (userId) => {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found.");

    const max = getMax(user.plan?.planType);
    const before = user.numOfChat ?? 0;
    user.numOfChat = Math.max(0, before - 1);

    // ‘가득찬 상태(=max)’에서 처음 사용했을 때 타이머 시작
    if (before === max) user.chatTimer = new Date();

    await user.save();
    return user;
};

export const acceptFriendRequestService = async (requestId) => {
    // 해당 친구 요청 조회
    const friendRequest = await FriendRequest.findById(requestId);
    if (!friendRequest) {
        throw new Error("친구 요청을 찾을 수 없습니다.");
    }
    if (friendRequest.status !== 'pending') {
        throw new Error("이미 처리된 친구 요청입니다.");
    }

    // 양쪽 사용자의 friends 배열에 서로의 ID 추가
    await User.findByIdAndUpdate(friendRequest.sender, { $push: { friends: friendRequest.receiver } });
    await User.findByIdAndUpdate(friendRequest.receiver, { $push: { friends: friendRequest.sender } });

    // 친구 요청 문서를 DB에서 삭제
    await FriendRequest.findByIdAndDelete(requestId);

    return {
        message: "친구 요청이 수락되어 삭제되었습니다.",
        friendRequest: friendRequest
    };
};

// 친구 요청 보내기 함수
export const sendFriendRequest = async (senderId, receiverId) => {
    // ❷ 수신자가 요청을 차단했는지 미리 확인
    const receiverUser = await User.findById(receiverId).select('friendReqEnabled');
    if (!receiverUser) throw new Error('받는 사용자를 찾을 수 없습니다.');
    if (!receiverUser.friendReqEnabled) {
        throw new Error('상대가 친구 요청을 차단했습니다.');
    }
    if (senderId === receiverId) {
        throw new Error("자기 자신에게 친구 요청을 보낼 수 없습니다.");
    }

    // 보내는 사용자의 정보를 조회하여 이미 친구인지 확인
    const senderUser = await User.findById(senderId);
    if (!senderUser) {
        throw new Error("보낸 사용자 정보를 찾을 수 없습니다.");
    }

    // 이미 친구인지 확인 (ObjectId는 문자열로 변환해서 비교)
    const alreadyFriends = senderUser.friends.some(friendId =>
        friendId.toString() === receiverId.toString()
    );
    if (alreadyFriends) {
        throw new Error("이미 친구입니다.");
    }

    // 이미 pending 상태의 요청이 존재하는지 확인
    const existingRequest = await FriendRequest.findOne({
        sender: senderId,
        receiver: receiverId,
        status: 'pending'
    });
    if (existingRequest) {
        throw new Error("이미 친구 요청을 보냈습니다.");
    }

    // 새로운 친구 요청 생성
    const newRequest = new FriendRequest({ sender: senderId, receiver: receiverId });
    await newRequest.save();
    return newRequest;
};

// 친구 요청 목록 조회 함수 (수신한 pending 요청)
export const getFriendRequests = async (receiverId) => {
    const requests = await FriendRequest.find({
        receiver: receiverId,
        status: 'pending'
    }).populate('sender', 'nickname name photo'); // 요청 보낸 사용자의 일부 정보 노출
    return requests;
};

// 친구 요청 거절 기능: 요청 상태를 'declined'로 업데이트한 후, DB에서 삭제합니다.
export const declineFriendRequestService = async (requestId) => {
    // 해당 친구 요청 조회
    const friendRequest = await FriendRequest.findById(requestId);
    if (!friendRequest) {
        throw new Error("친구 요청을 찾을 수 없습니다.");
    }
    // 이미 처리된 요청이면 에러 발생
    if (friendRequest.status !== 'pending') {
        throw new Error("이미 처리된 친구 요청입니다.");
    }

    // 상태를 'declined'로 업데이트한 후 저장 (로깅 등 필요할 경우 대비)
    friendRequest.status = 'declined';
    await friendRequest.save();

    // DB에서 해당 친구 요청 알림 삭제
    await FriendRequest.findByIdAndDelete(requestId);

    return {
        message: "친구 요청이 거절되어 삭제되었습니다.",
        friendRequest
    };
};

// 친구 삭제 기능
export const deleteFriend = async (userId, friendId) => {
    // 요청 사용자가 존재하는지 확인
    const user = await User.findById(userId);
    if (!user) {
        throw new Error("사용자를 찾을 수 없습니다.");
    }
    // 삭제 대상 친구가 존재하는지 확인
    const friend = await User.findById(friendId);
    if (!friend) {
        throw new Error("친구를 찾을 수 없습니다.");
    }
    // 친구 목록에 해당 친구가 있는지 확인
    if (!user.friends.includes(friendId)) {
        throw new Error("해당 사용자는 친구 목록에 존재하지 않습니다.");
    }
    // 사용자와 친구 양쪽에서 친구 id 제거
    await User.findByIdAndUpdate(userId, { $pull: { friends: friendId } });
    await User.findByIdAndUpdate(friendId, { $pull: { friends: userId } });
    return { message: "친구가 삭제되었습니다." };
};

/**
 * 사용자 차단
 */
export const blockUserService = async (userId, targetId) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('사용자를 찾을 수 없습니다.');
    if (!user.blockedUsers.includes(targetId)) {
        user.blockedUsers.push(targetId);
        await user.save();
    }
    return user;
};

/**
 * 차단 해제
 */
export const unblockUserService = async (userId, targetId) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('사용자를 찾을 수 없습니다.');
    user.blockedUsers = user.blockedUsers.filter(id => id.toString() !== targetId);
    await user.save();
    return user;
};

/**
 * 차단 목록 조회
 */
export const getBlockedUsersService = async (userId) => {
    const user = await User.findById(userId).populate('blockedUsers', 'nickname name profilePhoto createdAt');
    if (!user) throw new Error('사용자를 찾을 수 없습니다.');
    return user.blockedUsers;
};

export const getPaginatedFriends = async (
    userId,
    offset = 0,
    limit = 20,
) => {
    // friends 배열을 DB 쪽에서 잘라서 가져옴
    const user = await User.findById(userId)
        .slice('friends', [offset, limit])      // <- $slice 전달
        .populate('friends', 'nickname profilePhoto'); // 필요한 필드만

    if (!user) throw new Error('User not found');

    // 전체 친구 수도 내려주고 싶다면 한 번 더 가볍게 조회
    const totalCnt =
        (await User.findById(userId).select('friends').lean())?.friends.length || 0;

    // 🔧 온라인 상태 정보 추가 (배치로 효율적 처리)
    const friendIds = user.friends.map(friend => friend._id.toString());
    const onlineStatusMap = onlineStatusService.getMultipleUserStatus(friendIds);
    
    const friendsWithStatus = user.friends.map(friend => ({
        ...friend.toObject(),
        isOnline: onlineStatusMap[friend._id.toString()] || false
    }));

    return { total: totalCnt, friends: friendsWithStatus };
};

// ✅ 네이버 access_token 업데이트 함수 추가
export const updateUserNaverToken = async (userId, accessToken) => {
    try {
        console.log('네이버 토큰 업데이트 시작:', userId, accessToken ? 'token_present' : 'token_null');
        
        const updateData = accessToken 
            ? { 'social.naver.accessToken': accessToken }
            : { $unset: { 'social.naver.accessToken': 1 } };
        
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true }
        );
        
        if (!updatedUser) {
            throw new Error('사용자를 찾을 수 없습니다');
        }
        
        console.log('네이버 토큰 업데이트 성공');
        return updatedUser;
    } catch (error) {
        console.error('네이버 토큰 업데이트 실패:', error);
        throw error;
    }
};

