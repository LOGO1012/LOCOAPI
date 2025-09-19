// src/services/userService.js (암호화 및 캐시 통합 버전) - 최종 완성
import mongoose from 'mongoose';
import { normalizeBirthdate } from "../utils/normalizeBirthdate.js";
import { normalizePhoneNumber } from "../utils/normalizePhoneNumber.js";
import { ChatRoom } from '../models/chat.js';
import { User } from '../models/UserProfile.js';
import { FriendRequest } from "../models/FriendRequest.js";
import { getMax, rechargeIfNeeded, REFILL_MS } from "../utils/chatQuota.js";
import { UserHistory } from '../models/UserHistory.js';
import * as onlineStatusService from "./onlineStatusService.js";
import ComprehensiveEncryption from "../utils/encryption/comprehensiveEncryption.js";
import IntelligentCache from "../utils/cache/intelligentCache.js";
import { Community } from '../models/Community.js';
import { Qna } from '../models/Qna.js';

// ============================================================================
//   소셜 로그인 관련 함수
// ============================================================================


// 카카오 로그인 시 사용자 찾기 또는 회원가입 필요 판단
//역할:
// 카카오 ID로 기존 사용자 검색
// 없으면 이름+전화번호+생년월일로 기존 계정 찾기
// 기존 계정에 카카오 정보 병합
// 완전 신규면 회원가입 필요 알림
export const findUserOrNoUser = async (kakaoUserData) => {
    try {
        const normalizedBirthdate = normalizeBirthdate(kakaoUserData.birthyear, kakaoUserData.birthday);
        const normalizedPhone = normalizePhoneNumber(kakaoUserData.phoneNumber);

        console.log("DEBUG: 카카오 데이터 - 이름:", kakaoUserData.name,
            "전화번호:", normalizedPhone,
            "원본 birthday:", kakaoUserData.birthday,
            "Normalized Birthdate:", normalizedBirthdate);

        let existingUser = null;

        if (process.env.ENABLE_ENCRYPTION === 'true') {
            try {
                existingUser = await ComprehensiveEncryption.findUserBySocialId(
                    User, 'kakao', kakaoUserData.kakaoId
                );
                console.log("DEBUG: 해시 기반 카카오 검색 결과:", !!existingUser);
            } catch (error) {
                console.warn("해시 기반 검색 실패, 기존 방식 사용:", error);
            }
        }

        if (!existingUser) {
            existingUser = await User.findOne({ 'social.kakao.providerId': kakaoUserData.kakaoId });
            console.log("DEBUG: 기존 방식 카카오 검색 결과:", !!existingUser);
        }

        if (!existingUser && kakaoUserData.name && normalizedPhone && normalizedBirthdate) {
            console.log("DEBUG: 공통 식별자로 조회 시작");

            if (process.env.ENABLE_ENCRYPTION === 'true') {
                const nameHash = ComprehensiveEncryption.createSearchHash(kakaoUserData.name);
                const phoneHash = ComprehensiveEncryption.createPhoneHash(normalizedPhone);
                const birthdateHash = ComprehensiveEncryption.createSearchHash(normalizedBirthdate);

                existingUser = await User.findOne({
                    name_hash: nameHash,
                    phone_hash: phoneHash,
                    birthdate_hash: birthdateHash,
                });
                console.log("DEBUG: 해시 기반 공통 식별자 검색 결과:", !!existingUser);
            }

            if (!existingUser) {
                existingUser = await User.findOne({
                    name: kakaoUserData.name,
                    phone: normalizedPhone,
                    birthdate: normalizedBirthdate,
                });
                console.log("DEBUG: 평문 기반 공통 식별자 검색 결과:", !!existingUser);
            }

            if (existingUser && (!existingUser.social.kakao || !existingUser.social.kakao.providerId)) {
                console.log("DEBUG: 카카오 정보 병합 시작");

                const kakaoData = {
                    providerId: kakaoUserData.kakaoId,
                    name: kakaoUserData.name,
                    phoneNumber: kakaoUserData.phoneNumber,
                    birthday: kakaoUserData.birthday,
                    birthyear: kakaoUserData.birthyear,
                    gender: kakaoUserData.gender,
                };

                if (process.env.ENABLE_ENCRYPTION === 'true') {
                    const encryptedKakaoData = {
                        providerId: kakaoUserData.kakaoId,
                        providerId_hash: ComprehensiveEncryption.hashProviderId(kakaoUserData.kakaoId),
                        name: await ComprehensiveEncryption.encryptPersonalInfo(kakaoUserData.name),
                        phoneNumber: await ComprehensiveEncryption.encryptPersonalInfo(kakaoUserData.phoneNumber),
                        birthday: await ComprehensiveEncryption.encryptPersonalInfo(kakaoUserData.birthday.toString()),
                        birthyear: await ComprehensiveEncryption.encryptPersonalInfo(kakaoUserData.birthyear.toString()),
                        gender: kakaoUserData.gender,
                    };
                    existingUser.social.kakao = encryptedKakaoData;
                } else {
                    existingUser.social.kakao = kakaoData;
                }

                existingUser.markModified('social');
                await existingUser.save();
                await IntelligentCache.invalidateUserCache(existingUser._id);
                console.log("기존 계정에 카카오 정보 병합 완료");
            }
        }

        if (!existingUser) {
            console.log('등록된 사용자가 없습니다. 회원가입이 필요합니다.');
            return { status: 'noUser', ...kakaoUserData };
        }

        if (existingUser.status === 'deactivated') {
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            if (existingUser.deactivatedAt && (new Date().getTime() - existingUser.deactivatedAt.getTime()) < sevenDays) {
                const remainingTime = existingUser.deactivatedAt.getTime() + sevenDays - new Date().getTime();
                const remainingDays = Math.ceil(remainingTime / (1000 * 60 * 60 * 24));
                throw new Error(`회원 탈퇴 후 7일 동안 재가입할 수 없습니다. ${remainingDays}일 남았습니다.`);
            } else {
                // 7 days have passed. Return a special status to frontend.
                return { status: 'reactivation_possible', user: { _id: existingUser._id, nickname: existingUser.nickname, email: existingUser.email } };
            }
        }

        return existingUser;
    } catch (error) {
        console.error('User service error:', error.message);
        throw error;
    }
};
// 네이버 로그인 시 사용자 찾기
// findUserOrNoUser와 동일하지만 네이버 로그인용
export const findUserByNaver = async (naverUserData) => {
    try {
        const normalizedBirthdate = normalizeBirthdate(naverUserData.birthyear, naverUserData.birthday);
        const normalizedPhone = normalizePhoneNumber(naverUserData.phoneNumber);

        let existingUser = null;

        if (process.env.ENABLE_ENCRYPTION === 'true') {
            try {
                existingUser = await ComprehensiveEncryption.findUserBySocialId(
                    User, 'naver', naverUserData.naverId
                );
            } catch (error) {
                console.warn("해시 기반 검색 실패, 기존 방식 사용:", error);
            }
        }

        if (!existingUser) {
            existingUser = await User.findOne({ 'social.naver.providerId': naverUserData.naverId });
        }

        if (!existingUser && naverUserData.name && normalizedPhone && normalizedBirthdate) {
            if (process.env.ENABLE_ENCRYPTION === 'true') {
                const nameHash = ComprehensiveEncryption.createSearchHash(naverUserData.name);
                const phoneHash = ComprehensiveEncryption.createPhoneHash(normalizedPhone);
                const birthdateHash = ComprehensiveEncryption.createSearchHash(normalizedBirthdate);

                existingUser = await User.findOne({
                    name_hash: nameHash,
                    phone_hash: phoneHash,
                    birthdate_hash: birthdateHash,
                });
            }

            if (!existingUser) {
                existingUser = await User.findOne({
                    name: naverUserData.name,
                    phone: normalizedPhone,
                    birthdate: normalizedBirthdate,
                });
            }

            if (existingUser && (!existingUser.social.naver || !existingUser.social.naver.providerId)) {
                const naverData = {
                    providerId: naverUserData.naverId,
                    name: naverUserData.name,
                    phoneNumber: naverUserData.phoneNumber,
                    birthday: naverUserData.birthday,
                    birthyear: naverUserData.birthyear,
                    gender: naverUserData.gender,
                    accessToken: naverUserData.accessToken || '',
                };

                if (process.env.ENABLE_ENCRYPTION === 'true') {
                    const encryptedNaverData = {
                        providerId: naverUserData.naverId,
                        providerId_hash: ComprehensiveEncryption.hashProviderId(naverUserData.naverId),
                        name: await ComprehensiveEncryption.encryptPersonalInfo(naverUserData.name),
                        phoneNumber: await ComprehensiveEncryption.encryptPersonalInfo(naverUserData.phoneNumber),
                        birthday: await ComprehensiveEncryption.encryptPersonalInfo(naverUserData.birthday),
                        birthyear: await ComprehensiveEncryption.encryptPersonalInfo(naverUserData.birthyear.toString()),
                        gender: naverUserData.gender,
                        accessToken: naverUserData.accessToken || '',
                    };
                    existingUser.social.naver = encryptedNaverData;
                } else {
                    existingUser.social.naver = naverData;
                }

                existingUser.markModified('social');
                await existingUser.save();
                await IntelligentCache.invalidateUserCache(existingUser._id);
                console.log("기존 계정에 네이버 정보 병합 완료");
            }
        }

        if (!existingUser) {
            console.log('등록된 네이버 사용자가 없습니다. 회원가입이 필요합니다.');
            return { status: 'noUser', ...naverUserData };
        }

        if (existingUser.status === 'deactivated') {
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            if (existingUser.deactivatedAt && (new Date().getTime() - existingUser.deactivatedAt.getTime()) < sevenDays) {
                const remainingTime = existingUser.deactivatedAt.getTime() + sevenDays - new Date().getTime();
                const remainingDays = Math.ceil(remainingTime / (1000 * 60 * 60 * 24));
                throw new Error(`회원 탈퇴 후 7일 동안 재가입할 수 없습니다. ${remainingDays}일 남았습니다.`);
            } else {
                // 7 days have passed. Return a special status to frontend.
                return { status: 'reactivation_possible', user: { _id: existingUser._id, nickname: existingUser.nickname, email: existingUser.email } };
            }
        }

        return existingUser;
    } catch (error) {
        console.error('User service error:', error.message);
        throw error;
    }
};

export const updateUserNaverToken = async (userId, accessToken) => {
    try {
        const updateData = accessToken ? { 'social.naver.accessToken': accessToken } : { $unset: { 'social.naver.accessToken': 1 } };
        const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });
        if (!updatedUser) throw new Error('사용자를 찾을 수 없습니다');
        await IntelligentCache.invalidateUserCache(userId);
        return updatedUser;
    } catch (error) {
        console.error('네이버 토큰 업데이트 실패:', error);
        throw error;
    }
};


// ============================================================================
//   기본 사용자 조회 함수
// ============================================================================

// 사용자 상세 정보 조회 (채팅 할당량 포함)
//사용자 기본 정보 조회
// 채팅 할당량 계산 및 자동 충전
// 실시간 만나이 정보 제공
export const getUserById = async (userId) => {
    try {
        let user = await User.findById(userId);
        if (!user) throw new Error("사용자를 찾을 수 없습니다.");

        user = await rechargeIfNeeded(user);

        const maxChatCount = getMax(user.plan?.planType);
        const last = user.chatTimer ?? new Date();
        const nextRefillAt = new Date(new Date(last).getTime() + REFILL_MS);

        const data = user.toObject();
        data.maxChatCount = maxChatCount;
        data.nextRefillAt = nextRefillAt;

        // 🔧 birthdate 기반 만나이 계산
        if (user.birthdate) {
            try {
                const ageInfo = await IntelligentCache.getCachedUserAge(userId);
                if (ageInfo) {
                    data.calculatedAge = ageInfo.age;
                    data.ageGroup = ageInfo.ageGroup;
                    data.isMinor = ageInfo.isMinor;
                } else {
                    // 캐시가 없으면 실시간 계산
                    const decryptedBirthdate = await ComprehensiveEncryption.decryptPersonalInfo(user.birthdate);
                    if (decryptedBirthdate) {
                        const age = ComprehensiveEncryption.calculateAge(decryptedBirthdate);
                        const ageGroup = ComprehensiveEncryption.getAgeGroup(decryptedBirthdate);
                        const isMinor = ComprehensiveEncryption.isMinor(decryptedBirthdate);

                        data.calculatedAge = age;
                        data.ageGroup = ageGroup;
                        data.isMinor = isMinor;

                        // 캐시 저장
                        await IntelligentCache.cacheUserAge(userId, age, ageGroup, isMinor);
                    }
                }
            } catch (error) {
                console.error('만나이 정보 조회 실패:', error);
            }
        }

        return data;
    } catch (err) {
        throw new Error(err.message);
    }
};

// 닉네임으로 사용자 찾기
//닉네임 기반 사용자 검색
export const getUserByNickname = async (nickname) => {
    try {
        const user = await User.findOne({ nickname });
        if (!user) throw new Error("User not found.");
        return user;
    } catch (error) {
        throw new Error(error.message);
    }
};

// 사용자 별점 평가
//매너 평가 시스템 (별점 누적)
export const rateUser = async (userId, rating) => {
    if (typeof rating !== "number" || rating < 0 || rating > 5) {
        throw new Error("Rating must be a number between 0 and 5.");
    }
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found.");
    user.star += rating;
    await user.save();
    await IntelligentCache.invalidateUserCache(userId);
    return user;
};



// ============================================================================
//    채팅 관련 함수
// ============================================================================

// 채팅 횟수 차감
// 채팅 사용 시 남은 횟수 -1
// 최대 횟수에서 처음 차감 시 타이머 시작
export const decrementChatCount = async (userId) => {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found.");

    const max = getMax(user.plan?.planType);
    const before = user.numOfChat ?? 0;
    user.numOfChat = Math.max(0, before - 1);

    if (before === max) user.chatTimer = new Date();

    await user.save();
    await IntelligentCache.invalidateUserCache(userId);
    return user;
};

// 채팅방에서 표시할 간단한 사용자 정보
// 채팅방에서 빠른 로딩을 위한 최소 정보 제공 (캐시 활용)
export const getChatUserInfo = async (userId) => {
    try {
        let userInfo = await IntelligentCache.getChatUserInfo(userId);
        if (!userInfo) {
            const user = await User.findById(userId).select("nickname profilePhoto gender star birthdate").lean();
            if (!user) return null;

            userInfo = {
                nickname: user.nickname,
                profilePhoto: user.profilePhoto,
                gender: user.gender,
                star: user.star,
            };

            // 🔧 birthdate가 있을 때만 만나이 계산
            if (user.birthdate) {
                try {
                    const decryptedBirthdate = await ComprehensiveEncryption.decryptPersonalInfo(user.birthdate);
                    if (decryptedBirthdate) {
                        userInfo.age = ComprehensiveEncryption.calculateAge(decryptedBirthdate);
                        userInfo.ageGroup = ComprehensiveEncryption.getAgeGroup(decryptedBirthdate);
                        userInfo.isMinor = ComprehensiveEncryption.isMinor(decryptedBirthdate);
                    }
                } catch (error) {
                    console.error('만나이 계산 실패:', error);
                }
            }

            await IntelligentCache.cacheChatUserInfo(userId, userInfo, user.birthdate);
        }
        return userInfo;
    } catch (error) {
        throw error;
    }
};


// ============================================================================
//    친구 관리 함수
// ============================================================================

// 친구 요청 수락
// 친구 요청 수락 처리, 양방향 친구 관계 생성, 요청 기록 삭제
export const acceptFriendRequestService = async (requestId) => {
    // 해당 친구요청 조회
    const friendRequest = await FriendRequest.findById(requestId);

    if (!friendRequest) throw new Error("친구 요청을 찾을 수 없습니다.");

    if (friendRequest.status !== 'pending') throw new Error("이미 처리된 친구 요청입니다.");

    // 양쪽 사용자의 친구 배열에 서로의 ID추가
    await User.findByIdAndUpdate(friendRequest.sender, { $push: { friends: friendRequest.receiver } });
    await User.findByIdAndUpdate(friendRequest.receiver, { $push: { friends: friendRequest.sender } });

    // 친구 요청 문서를 DB에서 삭제
    await FriendRequest.findByIdAndDelete(requestId);

    await IntelligentCache.invalidateUserCache(friendRequest.sender);
    await IntelligentCache.invalidateUserCache(friendRequest.receiver);

    return { message: "친구 요청이 수락되어 삭제되었습니다.", friendRequest: friendRequest };
};

// 친구 요청 보내기
// 친구 요청 가능 여부 확인 (설정, 중복, 차단 등)
// 새로운 친구 요청 생성
export const sendFriendRequest = async (senderId, receiverId) => {

    // 수신자가 요청을 차단했는지 미리 확인
    const receiverUser = await User.findById(receiverId).select('friendReqEnabled');
    if (!receiverUser) throw new Error('받는 사용자를 찾을 수 없습니다.');
    if (!receiverUser.friendReqEnabled) throw new Error('상대가 친구 요청을 차단했습니다.');

    if (senderId === receiverId) throw new Error("자기 자신에게 친구 요청을 보낼 수 없습니다.");

    // 보내는 사용자의 정보를 조회하여 이미 친구인지 확인
    const senderUser = await User.findById(senderId);
    if (!senderUser) throw new Error("보낸 사용자 정보를 찾을 수 없습니다.");

    // 이미 친구인지 확인
    const alreadyFriends = senderUser.friends.some(friendId => friendId.toString() === receiverId.toString());
    if (alreadyFriends) throw new Error("이미 친구입니다.");

    // 이미 패딩 상태의 요청이 존재하는지 확인
    const existingRequest = await FriendRequest.findOne({ sender: senderId, receiver: receiverId, status: 'pending' });
    if (existingRequest) throw new Error("이미 친구 요청을 보냈습니다.");

    // 새로운 친구 요청 생성
    const newRequest = new FriendRequest({ sender: senderId, receiver: receiverId });
    await newRequest.save();
    return newRequest;
};

// 받은 친구 요청 목록
// 내가 받은 대기 중인 친구 요청 조회
export const getFriendRequests = async (receiverId) => {
    const requests = await FriendRequest.find({ receiver: receiverId, status: 'pending' }).populate('sender', 'nickname name photo');
    return requests;
};

// 친구 요청 거절 요청 상태를 DECLINED로 업데이트 한 후 DB에서 삭제
export const declineFriendRequestService = async (requestId) => {

    // 해당 친구 요청 조회
    const friendRequest = await FriendRequest.findById(requestId);
    if (!friendRequest) throw new Error("친구 요청을 찾을 수 없습니다.");

    // 이미 처리된 요청이면 에러 발생
    if (friendRequest.status !== 'pending') throw new Error("이미 처리된 친구 요청입니다.");

    // 상태를 declined로 업데이트 한 후 저장 (로깅등 필요할 경우 대비)
    friendRequest.status = 'declined';
    await friendRequest.save();

    // DB에서 해당 친구 요청 알림 삭제
    await FriendRequest.findByIdAndDelete(requestId);

    return { message: "친구 요청이 거절되어 삭제되었습니다.", friendRequest };
};

// 친구 삭제
export const deleteFriend = async (userId, friendId, io) => {

    //요청 사용자가 존재하는지 확인
    const user = await User.findById(userId);
    if (!user) throw new Error("사용자를 찾을 수 없습니다.");

    // 삭제 대상 친구가 존재하는지 확인
    const friend = await User.findById(friendId);
    if (!friend) throw new Error("친구를 찾을 수 없습니다.");

    // 친구 목록에 해당 친구가 있는지 확인
    if (!user.friends.includes(friendId)) throw new Error("해당 사용자는 친구 목록에 존재하지 않습니다.");

    // 사용자와 친구 양쪽에서 친구 ID 제거
    await User.findByIdAndUpdate(userId, { $pull: { friends: friendId } });
    await User.findByIdAndUpdate(friendId, { $pull: { friends: userId } });

    // Find and deactivate the friend chat room
    const chatRoom = await ChatRoom.findOne({
        roomType: 'friend',
        chatUsers: { $all: [userId, friendId] }
    });

    if (chatRoom) {
        chatRoom.isActive = false;
        await chatRoom.save();

        // Emit socket events to both users with roomId
        if (io) {
            io.to(userId).emit('friendDeleted', { friendId: friendId, roomId: chatRoom._id.toString() });
            io.to(friendId).emit('friendDeleted', { friendId: userId, roomId: chatRoom._id.toString() });
        }
    } else {
        // If there's no chat room, just emit the event without roomId
        if (io) {
            io.to(userId).emit('friendDeleted', { friendId: friendId, roomId: null });
            io.to(friendId).emit('friendDeleted', { friendId: userId, roomId: null });
        }
    }

    // 캐싱
    await IntelligentCache.invalidateUserCache(userId);
    await IntelligentCache.invalidateUserCache(friendId);

    return { message: "친구가 삭제되었습니다." };
};

// 친구 목록 페이지네이션 조회
// 친구 목록 페이지별 조회
// 온라인 상태 정보 포함
// 성능 최적화 (필요한 만큼만 로딩)
export const getPaginatedFriends = async (userId, offset = 0, limit = 20, online) => {
    const user = await User.findById(userId).select('friends').lean();
    if (!user) throw new Error('User not found');

    const allFriendIds = user.friends.map(id => id.toString());

    let filteredFriendIds = allFriendIds;

    // If 'online' filter is provided, filter the friend IDs
    if (online !== undefined && online !== null) {
        const onlineStatusMap = onlineStatusService.getMultipleUserStatus(allFriendIds);
        const isOnlineRequested = online === 'true' || online === true;
        filteredFriendIds = allFriendIds.filter(id => (onlineStatusMap[id] || false) === isOnlineRequested);
    }

    const total = filteredFriendIds.length;
    const paginatedIds = filteredFriendIds.slice(offset, offset + limit);

    if (paginatedIds.length === 0) {
        return { total, friends: [] };
    }

    const friends = await User.find({
        '_id': { $in: paginatedIds }
    }).select('nickname profilePhoto').lean();

    const friendsById = new Map(friends.map(f => [f._id.toString(), f]));

    // Add online status to the paginated friends
    const onlineStatusMapForPage = onlineStatusService.getMultipleUserStatus(paginatedIds);
    
    const orderedFriends = paginatedIds.map(id => {
        const friend = friendsById.get(id);
        if (!friend) return null;
        return {
            ...friend,
            isOnline: onlineStatusMapForPage[id] || false
        };
    }).filter(Boolean);

    return { total, friends: orderedFriends };
};

// ============================================================================
//    차단 관리 함수
// ============================================================================

// 사용자 차단
export const blockUserService = async (userId, targetId) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('사용자를 찾을 수 없습니다.');
    if (!user.blockedUsers.includes(targetId)) {
        user.blockedUsers.push(targetId);
        await user.save();
        await IntelligentCache.invalidateUserCache(userId);
    }
    return user;
};

// 차단 해제
export const unblockUserService = async (userId, targetId) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('사용자를 찾을 수 없습니다.');
    user.blockedUsers = user.blockedUsers.filter(id => id.toString() !== targetId);
    await user.save();
    await IntelligentCache.invalidateUserCache(userId);
    return user;
};

// 차단 목록 조회
export const getBlockedUsersService = async (userId) => {
    const user = await User.findById(userId).populate('blockedUsers', 'nickname name profilePhoto createdAt');
    if (!user) throw new Error('사용자를 찾을 수 없습니다.');
    return user.blockedUsers;
};




// ============================================================================
// 🎯 새로운 고급 기능들 (기존 함수명과 분리)  (암호화 & 캐시 시스템)
// ============================================================================
// 새 사용자 생성 (KMS 암호화 적용) - 수정된 버전
export const createUser = async (userData) => {
    try {
        const { deactivationCount = 0, ...restUserData } = userData;

        console.log('🔧 createUser 시작 - 입력 데이터:', {
            hasName: !!restUserData.name,
            hasNickname: !!restUserData.nickname,
            nickname: restUserData.nickname,
            hasPhone: !!restUserData.phone,
            hasBirthdate: !!restUserData.birthdate,
            gender: restUserData.gender,
            deactivationCount
        });

        // 🔧 필수 필드 검증 (서비스 레벨에서도 한 번 더)
        if (!restUserData.nickname || restUserData.nickname.trim() === '') {
            throw new Error('nickname은 필수 필드입니다.');
        }

        // 🔧 KMS 암호화 처리를 더 안전하게
        let encryptedUserData;
        
        // 🔧 암호화 활성화 여부 확인
        if (process.env.ENABLE_ENCRYPTION === 'true') {
            try {
                console.log('🔐 KMS 암호화 시작...');
                encryptedUserData = await ComprehensiveEncryption.encryptUserData(restUserData);
                console.log('✅ KMS 암호화 완료');
            } catch (encryptionError) {
                console.error('❌ KMS 암호화 실패:', encryptionError.message);
                console.log('🔄 암호화 비활성화로 폴백...');
                encryptedUserData = { ...restUserData }; // 폴백: 원본 데이터 사용
            }
        } else {
            console.log('🔐 암호화 비활성화 모드: 원본 데이터 사용');
            encryptedUserData = { ...restUserData };
        }

        // 🔧 사용자 생성 전 데이터 확인
        console.log('🔧 DB 저장 전 데이터 확인:', {
            hasNickname: !!encryptedUserData.nickname,
            nickname: encryptedUserData.nickname,
            hasGender: !!encryptedUserData.gender,
            gender: encryptedUserData.gender,
            dataKeys: Object.keys(encryptedUserData)
        });

        // 🔧 필수 필드 강제 설정 (문제 해결)
        if (!encryptedUserData.nickname) {
            encryptedUserData.nickname = restUserData.nickname;
        }
        if (!encryptedUserData.gender) {
            encryptedUserData.gender = restUserData.gender || 'select';
        }

        // 🔧 User 모델 생성
        const user = new User({
            ...encryptedUserData,
            deactivationCount // 이관받은 탈퇴 횟수 설정
        });

        console.log('🔧 User 인스턴스 생성 완료, KMS 암호화 데이터로 저장 시도 중...');

        const savedUser = await user.save();
        console.log('✅ DB 저장 성공 (KMS 암호화):', {
            id: savedUser._id,
            nickname: savedUser.nickname,
            gender: savedUser.gender,
            hasEncryptedName: !!savedUser.name,
            hasEncryptedPhone: !!savedUser.phone,
            hasEncryptedBirthdate: !!savedUser.birthdate
        });

        // 🔧 나이 정보 캐싱 (에러가 발생해도 사용자 생성은 성공)
        if (savedUser.birthdate) {
            try {
                console.log('📊 나이 정보 캐싱 시작...');
                const decryptedBirthdate = ComprehensiveEncryption.decryptPersonalInfo(savedUser.birthdate);
                if (decryptedBirthdate) {
                    const age = ComprehensiveEncryption.calculateAge(decryptedBirthdate);
                    const ageGroup = ComprehensiveEncryption.getAgeGroup(decryptedBirthdate);
                    const isMinor = ComprehensiveEncryption.isMinor(decryptedBirthdate);
                    await IntelligentCache.cacheUserAge(savedUser._id, age, ageGroup, isMinor);
                    console.log('✅ 나이 정보 캐싱 완료');
                }
            } catch (error) {
                console.warn('⚠️ 나이 캐싱 실패 (사용자 생성은 성공):', error.message);
            }
        }

        // 🔧 채팅 사용자 정보 캐싱 (에러가 발생해도 사용자 생성은 성공)
        try {
            console.log('💬 채팅 사용자 정보 캐싱 시작...');
            await IntelligentCache.cacheChatUserInfo(savedUser._id, {
                nickname: savedUser.nickname,
                profilePhoto: savedUser.profilePhoto || '',
                gender: savedUser.gender,
                star: savedUser.star || 0,
            }, savedUser.birthdate);
            console.log('✅ 채팅 사용자 정보 캐싱 완료');
        } catch (error) {
            console.warn('⚠️ 채팅 정보 캐싱 실패 (사용자 생성은 성공):', error.message);
        }

        return savedUser;

    } catch (error) {
        console.error('❌ createUser 실패:', {
            message: error.message,
            name: error.name,
            stack: error.stack,
            userData: {
                nickname: userData?.nickname,
                hasName: !!userData?.name,
                hasPhone: !!userData?.phone
            }
        });

        // 🔧 에러를 다시 던지되, 더 명확한 메시지와 함께
        if (error.name === 'ValidationError') {
            const validationDetails = Object.keys(error.errors).map(key =>
                `${key}: ${error.errors[key].message}`
            ).join(', ');
            throw new Error(`사용자 데이터 검증 실패: ${validationDetails}`);
        }

        if (error.code === 11000) {
            throw new Error('이미 사용 중인 닉네임입니다.');
        }

        // KMS 관련 에러
        if (error.message.includes('KMS') || error.message.includes('암호화')) {
            throw new Error(`KMS 암호화 처리 실패: ${error.message}`);
        }

        throw error;
    }
};

// 전화번호로 사용자 찾기 (암호화 지원)
// 해시 기반 빠른 검색, 암호화된 전화번호 매칭, 기존 평문 데이터 호환
export const findUserByPhone = async (phoneNumber) => {
    try {
        if (process.env.ENABLE_ENCRYPTION === 'true') {
            const phoneHash = ComprehensiveEncryption.createPhoneHash(phoneNumber);
            const users = await User.find({ phone_hash: phoneHash });
            for (const user of users) {
                const decryptedPhone = ComprehensiveEncryption.decryptPersonalInfo(user.phone);
                if (decryptedPhone === phoneNumber) return user;
            }
        }
        return await User.findOne({ phone: phoneNumber });
    } catch (error) {
        throw error;
    }
};

// 이름으로 사용자 찾기 (실명 검색)
// 실명 기반 사용자 검색 (고객지원용)
export const findUserByName = async (name) => {
    try {
        if (process.env.ENABLE_ENCRYPTION === 'true') {
            const nameHash = ComprehensiveEncryption.createSearchHash(name);
            const users = await User.find({ name_hash: nameHash });
            for (const user of users) {
                const decryptedName = ComprehensiveEncryption.decryptPersonalInfo(user.name);
                if (decryptedName === name) return user;
            }
        }
        return await User.findOne({ name: name });
    } catch (error) {
        throw error;
    }
};

// 나이대별 사용자 검색
// 연령대 기반 매칭 시스템, 성별 필터링 지원, 실시간 만나이 계산
export const findUsersByAgeRange = async (minAge, maxAge, gender = null) => {
    try {
        const filter = {};
        if (gender && gender !== 'select') filter.gender = gender;

        // 🔧 birthdate가 있는 사용자만 조회
        const users = await User.find({
            ...filter,
            birthdate: { $ne: "", $exists: true }
        }).select('nickname profilePhoto gender birthdate star').lean();

        const filteredUsers = users.filter(user => {
            try {
                const decryptedBirthdate = ComprehensiveEncryption.decryptPersonalInfo(user.birthdate);
                if (!decryptedBirthdate) return false;

                const age = ComprehensiveEncryption.calculateAge(decryptedBirthdate);
                return age !== null && age >= minAge && age <= maxAge;
            } catch (error) {
                return false;
            }
        }).map(user => {
            const decryptedBirthdate = ComprehensiveEncryption.decryptPersonalInfo(user.birthdate);
            const age = ComprehensiveEncryption.calculateAge(decryptedBirthdate);

            return {
                ...user,
                age,
                ageGroup: ComprehensiveEncryption.getAgeGroup(decryptedBirthdate),
                isMinor: ComprehensiveEncryption.isMinor(decryptedBirthdate)
            };
        });

        return filteredUsers;
    } catch (error) {
        throw error;
    }
};

// 안전한 매칭 사용자 조회 (미성년자 보호)
// 미성년자(19세 미만)는 동일 연령대만 매칭, 성인은 성인끼리만 매칭, 청소년 보호법 준수
export const getSafeMatchingUsers = async (currentUserId) => {
    try {
        const currentUser = await User.findById(currentUserId).lean();
        if (!currentUser || !currentUser.birthdate) return [];

        const currentUserBirthdate = ComprehensiveEncryption.decryptPersonalInfo(currentUser.birthdate);
        if (!currentUserBirthdate) return [];

        const isCurrentUserMinor = ComprehensiveEncryption.isMinor(currentUserBirthdate);

        // 🔧 미성년자 보호: 동일 연령대만 매칭
        if (isCurrentUserMinor) {
            return await findUsersByAgeRange(0, 18, currentUser.gender);
        } else {
            return await findUsersByAgeRange(19, 100, currentUser.gender);
        }
    } catch (error) {
        throw error;
    }
};

// 특정 연령대 사용자 조회
// 연령대별 사용자 그룹핑, 캐시 활용으로 빠른 조회, 매칭 알고리즘 지원
export const getUsersByAgeGroup = async (ageGroup) => {
    try {
        let users = await IntelligentCache.getCachedAgeGroupUsers(ageGroup);

        if (!users) {
            // 🔧 birthdate가 있는 사용자만 조회
            const allUsers = await User.find({
                birthdate: { $ne: "", $exists: true }
            }).select('nickname profilePhoto gender birthdate star').lean();

            users = allUsers.filter(user => {
                try {
                    const decryptedBirthdate = ComprehensiveEncryption.decryptPersonalInfo(user.birthdate);
                    if (!decryptedBirthdate) return false;

                    const userAgeGroup = ComprehensiveEncryption.getAgeGroup(decryptedBirthdate);
                    return userAgeGroup === ageGroup;
                } catch (error) {
                    return false;
                }
            }).map(user => {
                const decryptedBirthdate = ComprehensiveEncryption.decryptPersonalInfo(user.birthdate);
                return {
                    ...user,
                    age: ComprehensiveEncryption.calculateAge(decryptedBirthdate),
                    ageGroup: ComprehensiveEncryption.getAgeGroup(decryptedBirthdate),
                    isMinor: ComprehensiveEncryption.isMinor(decryptedBirthdate)
                };
            });

            await IntelligentCache.cacheAgeGroupUsers(ageGroup, users);
        }

        return users;
    } catch (error) {
        throw error;
    }
};

// 관리자용 복호화된 사용자 정보
// 관리자/고객지원 전용, 모든 개인정보 복호화, 실시간 나이 정보 포함
// src/services/userService.js - getDecryptedUserForAdmin 최종 수정본
// src/services/userService.js - getDecryptedUserForAdmin 최종 완성본
export const getDecryptedUserForAdmin = async (userId) => {
    try {
        console.log(`🔐 관리자용 복호화 시작: ${userId}`);

        // 1️⃣ 캐시 확인
        let decryptedUser = await IntelligentCache.getDecryptedUser(userId);
        if (decryptedUser) {
            console.log(`✅ 캐시에서 복호화 데이터 발견: ${userId}`);
            return decryptedUser;
        }

        // 2️⃣ DB에서 원본 데이터 조회
        const user = await User.findById(userId).lean();
        if (!user) {
            console.log(`❌ 사용자를 찾을 수 없음: ${userId}`);
            return null;
        }

        console.log(`📋 원본 데이터 조회 완료: ${userId}`);
        decryptedUser = { ...user }; // 복사본 생성

        // 3️⃣ 복호화가 필요한 모든 필드 목록 정의 (소셜 정보 포함)
        const fieldsToDecrypt = [
            { source: 'name', target: 'decrypted_name' },
            { source: 'phone', target: 'decrypted_phone' },
            { source: 'birthdate', target: 'decrypted_birthdate' },
        ];

        // ✅ 카카오 정보가 있으면 복호화 목록에 추가
        if (user.social?.kakao) {
            fieldsToDecrypt.push(
                { source: ['social', 'kakao', 'name'], target: ['social', 'kakao', 'decrypted_name'] },
                { source: ['social', 'kakao', 'phoneNumber'], target: ['social', 'kakao', 'decrypted_phoneNumber'] },
                { source: ['social', 'kakao', 'birthday'], target: ['social', 'kakao', 'decrypted_birthday'] },
                { source: ['social', 'kakao', 'birthyear'], target: ['social', 'kakao', 'decrypted_birthyear'] }
            );
        }

        // ✅ 네이버 정보가 있으면 복호화 목록에 추가
        if (user.social?.naver) {
            fieldsToDecrypt.push(
                { source: ['social', 'naver', 'name'], target: ['social', 'naver', 'decrypted_name'] },
                { source: ['social', 'naver', 'phoneNumber'], target: ['social', 'naver', 'decrypted_phoneNumber'] },
                { source: ['social', 'naver', 'birthday'], target: ['social', 'naver', 'decrypted_birthday'] },
                { source: ['social', 'naver', 'birthyear'], target: ['social', 'naver', 'decrypted_birthyear'] }
            );
        }

        // 4️⃣ Promise.all로 모든 필드를 병렬 복호화
        await Promise.all(
            fieldsToDecrypt.map(async (field) => {
                const originalValue = Array.isArray(field.source)
                    ? field.source.reduce((obj, key) => (obj && obj[key] !== undefined) ? obj[key] : undefined, user)
                    : user[field.source];

                let decryptedValue = null;
                if (originalValue) {
                    try {
                        decryptedValue = await ComprehensiveEncryption.decryptPersonalInfo(originalValue);
                    } catch (e) {
                        console.warn(`⚠️ 필드 '${field.source}' 복호화 중 오류 발생:`, e.message);
                        decryptedValue = `[복호화 오류]`;
                    }
                }

                if (Array.isArray(field.target)) {
                    let current = decryptedUser;
                    for (let i = 0; i < field.target.length - 1; i++) {
                        current = current[field.target[i]] = current[field.target[i]] || {};
                    }
                    current[field.target[field.target.length - 1]] = decryptedValue || '';
                } else {
                    decryptedUser[field.target] = decryptedValue || '';
                }
            })
        );

        // 5️⃣ 나이 정보 계산
        if (decryptedUser.decrypted_birthdate) {
            decryptedUser.calculated_age = ComprehensiveEncryption.calculateAge(decryptedUser.decrypted_birthdate);
            decryptedUser.age_group = ComprehensiveEncryption.getAgeGroup(decryptedUser.decrypted_birthdate);
            decryptedUser.is_minor = ComprehensiveEncryption.isMinor(decryptedUser.decrypted_birthdate);
        }

        console.log(`✅ 소셜 정보 포함, 전체 복호화 완료: ${userId}`);

        // 6️⃣ 캐시에 저장
        await IntelligentCache.cacheDecryptedUser(userId, decryptedUser);

        return decryptedUser;
    } catch (error) {
        console.error(`❌ 관리자용 복호화 전체 실패: ${userId}`, error);
        throw error;
    }
};
// export const getDecryptedUserForAdmin = async (userId) => {
//     try {
//         console.log(`🔐 관리자용 복호화 시작: ${userId}`);
//
//         // 1️⃣ 캐시에서 복호화된 데이터 확인
//         let decryptedUser = await IntelligentCache.getDecryptedUser(userId);
//         if (decryptedUser) {
//             console.log(`✅ 캐시에서 복호화 데이터 발견: ${userId}`);
//             return decryptedUser;
//         }
//
//         // 2️⃣ DB에서 원본 데이터 조회
//         const user = await User.findById(userId).lean();
//         if (!user) {
//             console.log(`❌ 사용자를 찾을 수 없음: ${userId}`);
//             return null;
//         }
//
//         console.log(`📋 원본 데이터 조회 완료: ${userId}`, {
//             hasName: !!user.name,
//             hasPhone: !!user.phone,
//             hasBirthdate: !!user.birthdate,
//             namePreview: user.name ? user.name.substring(0, 20) + '...' : 'null'
//         });
//
//         // 3️⃣ 암호화 모드 확인 및 복호화 수행
//         if (process.env.ENABLE_ENCRYPTION === 'true') {
//             console.log(`🔓 KMS 복호화 모드 활성화`);
//
//             // 기본 정보 복호화
//             decryptedUser = {
//                 ...user,
//                 // 원본 암호화 필드 보존 (디버깅용)
//                 _encrypted_name: user.name,
//                 _encrypted_phone: user.phone,
//                 _encrypted_birthdate: user.birthdate,
//
//                 // 복호화된 필드 추가
//                 decrypted_name: user.name ?
//                     await ComprehensiveEncryption.decryptPersonalInfo(user.name) : '',
//                 decrypted_phone: user.phone ?
//                     await ComprehensiveEncryption.decryptPersonalInfo(user.phone) : '',
//                 decrypted_birthdate: user.birthdate ?
//                     await ComprehensiveEncryption.decryptPersonalInfo(user.birthdate) : '',
//             };
//
//             // 소셜 정보 복호화
//             if (user.social?.kakao) {
//                 decryptedUser.social.kakao = {
//                     ...user.social.kakao,
//                     decrypted_name: user.social.kakao.name ?
//                         await ComprehensiveEncryption.decryptPersonalInfo(user.social.kakao.name) : '',
//                     decrypted_phoneNumber: user.social.kakao.phoneNumber ?
//                         await ComprehensiveEncryption.decryptPersonalInfo(user.social.kakao.phoneNumber) : '',
//                     decrypted_birthday: user.social.kakao.birthday ?
//                         await ComprehensiveEncryption.decryptPersonalInfo(user.social.kakao.birthday) : '',
//                     decrypted_birthyear: user.social.kakao.birthyear ?
//                         await ComprehensiveEncryption.decryptPersonalInfo(user.social.kakao.birthyear) : ''
//                 };
//             }
//
//             if (user.social?.naver) {
//                 decryptedUser.social.naver = {
//                     ...user.social.naver,
//                     decrypted_name: user.social.naver.name ?
//                         ComprehensiveEncryption.decryptPersonalInfo(user.social.naver.name) : '',
//                     decrypted_phoneNumber: user.social.naver.phoneNumber ?
//                         ComprehensiveEncryption.decryptPersonalInfo(user.social.naver.phoneNumber) : '',
//                     decrypted_birthday: user.social.naver.birthday ?
//                         ComprehensiveEncryption.decryptPersonalInfo(user.social.naver.birthday) : '',
//                     decrypted_birthyear: user.social.naver.birthyear ?
//                         ComprehensiveEncryption.decryptPersonalInfo(user.social.naver.birthyear) : ''
//                 };
//             }
//
//             // 나이 정보 계산
//             if (decryptedUser.decrypted_birthdate) {
//                 decryptedUser.calculated_age = ComprehensiveEncryption.calculateAge(decryptedUser.decrypted_birthdate);
//                 decryptedUser.age_group = ComprehensiveEncryption.getAgeGroup(decryptedUser.decrypted_birthdate);
//                 decryptedUser.is_minor = ComprehensiveEncryption.isMinor(decryptedUser.decrypted_birthdate);
//             }
//
//             console.log(`✅ KMS 복호화 완료: ${userId}`, {
//                 decrypted_name: decryptedUser.decrypted_name ? decryptedUser.decrypted_name.substring(0, 3) + '***' : 'null',
//                 decrypted_phone: decryptedUser.decrypted_phone ? decryptedUser.decrypted_phone.substring(0, 3) + '***' : 'null',
//                 calculated_age: decryptedUser.calculated_age
//             });
//         } else {
//             console.log(`🔓 평문 모드 (암호화 비활성화)`);
//             decryptedUser = {
//                 ...user,
//                 decrypted_name: user.name || '',
//                 decrypted_phone: user.phone || '',
//                 decrypted_birthdate: user.birthdate || '',
//                 calculated_age: user.birthdate ? ComprehensiveEncryption.calculateAge(user.birthdate) : null,
//                 age_group: user.birthdate ? ComprehensiveEncryption.getAgeGroup(user.birthdate) : null,
//                 is_minor: user.birthdate ? ComprehensiveEncryption.isMinor(user.birthdate) : false
//             };
//         }
//
//         // 4️⃣ 캐시에 저장
//         await IntelligentCache.cacheDecryptedUser(userId, decryptedUser);
//         console.log(`💾 복호화 데이터 캐시 저장 완료: ${userId}`);
//
//         return decryptedUser;
//     } catch (error) {
//         console.error(`❌ 관리자용 복호화 실패: ${userId}`, error);
//         throw error;
//     }
// };


// 사용자 정보 업데이트 (암호화 자동 적용)
// 개인정보 자동 암호화, 캐시 무효화, 해시 필드 자동 갱신
export const updateUser = async (userId, updateData) => {
    try {
        const encryptedUpdateData = ComprehensiveEncryption.encryptUserData(updateData);
        const updatedUser = await User.findByIdAndUpdate(userId, encryptedUpdateData, { new: true });
        await IntelligentCache.invalidateUserCache(userId);

        // 🔧 birthdate 업데이트 시 만나이 캐시 갱신
        if (updateData.birthdate && updatedUser.birthdate) {
            try {
                const decryptedBirthdate = ComprehensiveEncryption.decryptPersonalInfo(updatedUser.birthdate);
                if (decryptedBirthdate) {
                    const age = ComprehensiveEncryption.calculateAge(decryptedBirthdate);
                    const ageGroup = ComprehensiveEncryption.getAgeGroup(decryptedBirthdate);
                    const isMinor = ComprehensiveEncryption.isMinor(decryptedBirthdate);
                    await IntelligentCache.cacheUserAge(userId, age, ageGroup, isMinor);
                }
            } catch (error) {
                console.error('업데이트 후 만나이 캐싱 실패:', error);
            }
        }
        return updatedUser;
    } catch (error) {
        throw error;
    }
};

// 나이 정보만 빠르게 조회
// 캐시 우선 나이 정보 조회, 매칭 시스템에서 성능 최적화, 실시간 만나이 계산
export const getUserAgeInfo = async (userId) => {
    try {
        let ageInfo = await IntelligentCache.getCachedUserAge(userId);
        if (!ageInfo) {
            const user = await User.findById(userId).select('birthdate').lean();
            if (!user || !user.birthdate) return null;
            const decryptedBirthdate = ComprehensiveEncryption.decryptPersonalInfo(user.birthdate);
            if (!decryptedBirthdate) return null;

            // 🔧 birthdate 기반 만나이 계산
            const age = ComprehensiveEncryption.calculateAge(decryptedBirthdate);
            const ageGroup = ComprehensiveEncryption.getAgeGroup(decryptedBirthdate);
            const isMinor = ComprehensiveEncryption.isMinor(decryptedBirthdate);
            ageInfo = { age, ageGroup, isMinor };
            await IntelligentCache.cacheUserAge(userId, age, ageGroup, isMinor);
        }
        return ageInfo;
    } catch (error) {
        throw error;
    }
};

export const reactivateUserService = async (userId) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new Error("사용자를 찾을 수 없습니다.");
    }
    if (user.status !== 'deactivated') {
        throw new Error("이미 활성화된 계정입니다.");
    }

    user.status = 'active';
    user.deactivatedAt = null;

    await user.save();
    await IntelligentCache.invalidateUserCache(userId);

    return user;
};

export const deactivateUserService = async (userId) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new Error("사용자를 찾을 수 없습니다.");
    }
    if (user.status === 'deactivated') {
        throw new Error("이미 탈퇴한 회원입니다.");
    }

    const friendIds = user.friends; // 친구 목록 미리 저장

    // 1. 내 친구 목록 비우기
    user.friends = [];

    // 2. 친구들의 목록에서 나를 제거
    if (friendIds && friendIds.length > 0) {
        await User.updateMany(
            { _id: { $in: friendIds } },
            { $pull: { friends: userId } }
        );
    }

    // 3. 친구 채팅방 비활성화
    await ChatRoom.updateMany(
        { roomType: 'friend', chatUsers: userId },
        { $set: { isActive: false } }
    );

    // 4. 커뮤니티 게시글 하드 딜리트
    await Community.deleteMany({ userId: userId });

    // 5. 다른 사람 글에 남긴 댓글/답글/대대댓글 소프트 딜리트
    const now = new Date();
    const userIdObj = new mongoose.Types.ObjectId(userId);

    // 댓글 소프트 딜리트
    await Community.updateMany(
        { "comments.userId": userIdObj },
        { $set: { "comments.$[elem].isDeleted": true, "comments.$[elem].deletedAt": now } },
        { arrayFilters: [{ "elem.userId": userIdObj }] }
    );

    // 대댓글 소프트 딜리트
    await Community.updateMany(
        { "comments.replies.userId": userIdObj },
        { $set: { "comments.$[].replies.$[elem].isDeleted": true, "comments.$[].replies.$[elem].deletedAt": now } },
        { arrayFilters: [{ "elem.userId": userIdObj }] }
    );

    // 대대댓글 소프트 딜리트
    await Community.updateMany(
        { "comments.replies.subReplies.userId": userIdObj },
        { $set: { "comments.$[].replies.$[].subReplies.$[elem].isDeleted": true, "comments.$[].replies.$[].subReplies.$[elem].deletedAt": now } },
        { arrayFilters: [{ "elem.userId": userIdObj }] }
    );

    // 6. QnA 게시글 하드 딜리트
    await Qna.deleteMany({ userId: userId });

    user.status = 'deactivated';
    user.deactivatedAt = now;
    user.deactivationCount += 1;

    await user.save();
    await IntelligentCache.invalidateUserCache(userId);

    // 친구들의 캐시도 무효화
    if (friendIds && friendIds.length > 0) {
        await Promise.all(
            friendIds.map(friendId => IntelligentCache.invalidateUserCache(friendId))
        );
    }

    return {
        status: user.status,
        deactivatedAt: user.deactivatedAt,
    };
};

export const archiveAndPrepareNew = async (userId) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new Error("사용자를 찾을 수 없습니다.");
    }

    // 1. Archive user data
    const userHistory = new UserHistory({
        originalUserId: user._id,
        archivedData: user.toObject()
    });
    await userHistory.save();

    // 2. Delete the original user
    await User.findByIdAndDelete(userId);
    
    // 3. Invalidate cache
    await IntelligentCache.invalidateUserCache(userId);

    return { 
        success: true, 
        message: "기존 계정 정보가 보관처리 되었습니다.",
        deactivationCount: user.deactivationCount 
    };
};