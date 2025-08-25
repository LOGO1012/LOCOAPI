// src/services/userService.js
import {normalizeBirthdate} from "../utils/normalizeBirthdate.js";
import {normalizePhoneNumber} from "../utils/normalizePhoneNumber.js";
import { User } from '../models/UserProfile.js';
import {FriendRequest} from "../models/FriendRequest.js";
import {getMax, rechargeIfNeeded, REFILL_MS} from "../utils/chatQuota.js";
import * as onlineStatusService from "./onlineStatusService.js";
import { findUserByEncryptedFields, findUserByCommonIdentifiers } from '../utils/encryptedSearch.js';

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

        // 카카오 providerId로 먼저 검색
        let existingUser = await User.findOne({ 'social.kakao.providerId': kakaoUserData.kakaoId });
        console.log("DEBUG: DB에서 카카오 providerId로 조회 결과:", existingUser);

        // 만약 카카오 providerId가 없는 경우, 공통 식별자 기준으로 검색 (암호화 호환)
        if (!existingUser && kakaoUserData.name && normalizedPhone && normalizedBirthdate) {
            console.log("DEBUG: 카카오 providerId로 사용자가 없으므로, 암호화 호환 검색을 시도합니다:", {
                name: kakaoUserData.name,
                phone: normalizedPhone,
                birthdate: normalizedBirthdate,
            });
            
            // 암호화된 필드 검색 사용
            existingUser = await findUserByCommonIdentifiers(
                kakaoUserData.name,
                normalizedPhone,
                normalizedBirthdate
            );
            console.log("DEBUG: 암호화 호환 검색 결과:", existingUser);
            
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

// 네이버 사용자 조회 함수 수정 (암호화 호환)
export const findUserByNaver = async (naverUserData) => {
    try {
        const normalizedBirthdate = normalizeBirthdate(naverUserData.birthyear, naverUserData.birthday);
        const normalizedPhone = normalizePhoneNumber(naverUserData.phoneNumber);
        console.log("DEBUG: 네이버 데이터 - 이름:", naverUserData.name,
            "전화번호:", normalizedPhone,
            "원본 birthday:", naverUserData.birthday,
            "Normalized Birthdate:", normalizedBirthdate);

        // 네이버 providerId로 먼저 검색
        let existingUser = await User.findOne({ 'social.naver.providerId': naverUserData.naverId });
        console.log("DEBUG: DB에서 네이버 providerId로 조회 결과:", existingUser);

        // 만약 네이버 providerId가 없는 경우, 공통 식별자 기준으로 검색 (암호화 호환)
        if (!existingUser && naverUserData.name && normalizedPhone && normalizedBirthdate) {
            console.log("DEBUG: 네이버 providerId로 사용자가 없으므로, 암호화 호환 검색을 시도합니다:", {
                name: naverUserData.name,
                phone: normalizedPhone,
                birthdate: normalizedBirthdate,
            });
            
            // 암호화된 필드 검색 사용
            existingUser = await findUserByCommonIdentifiers(
                naverUserData.name,
                normalizedPhone,
                normalizedBirthdate
            );
            console.log("DEBUG: 암호화 호환 검색 결과:", existingUser);

            // 조회된 계정에 네이버 정보가 없다면 병합 처리
            if (existingUser && (!existingUser.social.naver || !existingUser.social.naver.providerId)) {
                console.log("DEBUG: 병합 전 기존 사용자의 소셜 정보:", existingUser.social);
                
                // 네이버 정보를 기존 계정에 병합
                existingUser.social.naver = {
                    providerId: naverUserData.naverId,
                    name: naverUserData.name,
                    phoneNumber: naverUserData.phoneNumber,
                    birthday: naverUserData.birthday,
                    gender: naverUserData.gender,
                    accessToken: naverUserData.access_token || ''
                };
                existingUser.markModified('social');
                await existingUser.save();
                console.log("기존 계정에 네이버 정보 병합 완료");
                console.log("DEBUG: 병합 후 사용자 정보:", existingUser);
            }
        }

        // 네이버 토큰 저장 (로그인된 사용자의 토큰 업데이트)
        if (existingUser && naverUserData.access_token) {
            try {
                await User.findByIdAndUpdate(existingUser._id, {
                    'social.naver.accessToken': naverUserData.access_token
                });
                console.log("네이버 액세스 토큰 저장 완료");
            } catch (tokenUpdateError) {
                console.error("네이버 토큰 저장 실패:", tokenUpdateError);
                // 토큰 저장 실패해도 로그인은 계속 진행
            }
        }

        // 등록된 사용자가 없으면 회원가입 필요 상태 반환
        if (!existingUser) {
            console.log('등록된 네이버 사용자가 없습니다. 회원가입이 필요합니다.');
            return { status: 'noUser', ...naverUserData };
        }

        // 등록된 사용자가 있으면 해당 사용자 객체를 반환
        return existingUser;
    } catch (error) {
        console.error('네이버 User service error:', error.message);
        throw error;
    }
};

export const getUserById = async (userId) => {
    try {
        return await User.findById(userId);
    } catch (error) {
        console.error('사용자 조회 오류:', error);
        throw error;
    }
};

export const getUserByNickname = async (nickname) => {
    try {
        return await User.findOne({ nickname });
    } catch (error) {
        console.error('닉네임으로 사용자 조회 오류:', error);
        throw error;
    }
};

export const getAllUsers = async () => {
    try {
        return await User.find({}, 'nickname tier profile userLv');
    } catch (error) {
        console.error('모든 사용자 조회 오류:', error);
        throw error;
    }
};

export const updateUserLevel = async (userId, newLevel) => {
    try {
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { userLv: newLevel },
            { new: true }
        );
        return updatedUser;
    } catch (error) {
        console.error('사용자 레벨 업데이트 오류:', error);
        throw error;
    }
};

export const getLoggedInUser = async (req) => {
    try {
        if (!req.user) {
            return null;
        }
        return req.user;
    } catch (error) {
        console.error('로그인된 사용자 조회 오류:', error);
        throw error;
    }
};

export const createUser = async (userData) => {
    try {
        const newUser = new User(userData);
        return await newUser.save();
    } catch (error) {
        console.error('사용자 생성 오류:', error);
        throw error;
    }
};

export const findUsersByKeyword = async (keyword) => {
    try {
        return await User.find({
            $or: [
                { nickname: { $regex: keyword, $options: 'i' } },
                // 암호화된 name 필드는 정확한 매칭만 가능
                // 검색 기능이 필요하면 별도의 검색 해시 필드 추가 고려
            ]
        });
    } catch (error) {
        console.error('키워드로 사용자 검색 오류:', error);
        throw error;
    }
};

export const updateLastActive = async (userId) => {
    try {
        await User.findByIdAndUpdate(userId, {
            lastActive: new Date()
        });
    } catch (error) {
        console.error('마지막 활동 시간 업데이트 오류:', error);
        // 비중요한 기능이므로 에러 throw 하지 않음
    }
};

export const getActiveFriends = async (userId) => {
    try {
        const user = await User.findById(userId).populate('friends');
        if (!user) return [];
        
        return user.friends.filter(friend => 
            friend.lastActive && 
            (new Date() - friend.lastActive) < 30 * 60 * 1000 // 30분 이내 활동
        );
    } catch (error) {
        console.error('활성 친구 조회 오류:', error);
        return [];
    }
};

export const isUserOnline = async (userId) => {
    try {
        return await onlineStatusService.isUserOnline(userId);
    } catch (error) {
        console.error('사용자 온라인 상태 확인 오류:', error);
        return false;
    }
};

// 채팅 쿼터 관련 함수들
export const updateChatQuota = async (userId, quotaData) => {
    try {
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                'chatQuota.current': quotaData.current,
                'chatQuota.lastRefillTime': quotaData.lastRefillTime
            },
            { new: true }
        );
        return updatedUser;
    } catch (error) {
        console.error('채팅 쿼터 업데이트 오류:', error);
        throw error;
    }
};

export const getUserChatQuota = async (userId) => {
    try {
        const user = await User.findById(userId, 'chatQuota userLv');
        if (!user) return null;
        
        const maxQuota = getMax(user.userLv);
        const rechargedQuota = rechargeIfNeeded(user.chatQuota, maxQuota);
        
        if (rechargedQuota.current !== user.chatQuota.current) {
            await updateChatQuota(userId, rechargedQuota);
        }
        
        return {
            current: rechargedQuota.current,
            max: maxQuota,
            lastRefillTime: rechargedQuota.lastRefillTime
        };
    } catch (error) {
        console.error('사용자 채팅 쿼터 조회 오류:', error);
        throw error;
    }
};

// ===========================================
// 🤝 친구 관련 함수들
// ===========================================

export const sendFriendRequest = async (fromUserId, toUserId) => {
    try {
        // 중복 요청 확인
        const existingRequest = await FriendRequest.findOne({
            from: fromUserId,
            to: toUserId,
            status: 'pending'
        });
        
        if (existingRequest) {
            throw new Error('이미 친구 요청을 보냈습니다');
        }
        
        // 새 친구 요청 생성
        const friendRequest = new FriendRequest({
            from: fromUserId,
            to: toUserId,
            status: 'pending'
        });
        
        return await friendRequest.save();
    } catch (error) {
        console.error('친구 요청 전송 오류:', error);
        throw error;
    }
};

export const acceptFriendRequestService = async (requestId, userId) => {
    try {
        const friendRequest = await FriendRequest.findById(requestId).populate('from to');
        
        if (!friendRequest || friendRequest.to._id.toString() !== userId) {
            throw new Error('친구 요청을 찾을 수 없습니다');
        }
        
        if (friendRequest.status !== 'pending') {
            throw new Error('이미 처리된 친구 요청입니다');
        }
        
        // 친구 관계 추가
        await User.findByIdAndUpdate(friendRequest.from._id, {
            $addToSet: { friends: friendRequest.to._id }
        });
        
        await User.findByIdAndUpdate(friendRequest.to._id, {
            $addToSet: { friends: friendRequest.from._id }
        });
        
        // 요청 상태 업데이트
        friendRequest.status = 'accepted';
        await friendRequest.save();
        
        return friendRequest;
    } catch (error) {
        console.error('친구 요청 수락 오류:', error);
        throw error;
    }
};

export const declineFriendRequestService = async (requestId, userId) => {
    try {
        const friendRequest = await FriendRequest.findById(requestId);
        
        if (!friendRequest || friendRequest.to.toString() !== userId) {
            throw new Error('친구 요청을 찾을 수 없습니다');
        }
        
        friendRequest.status = 'declined';
        return await friendRequest.save();
    } catch (error) {
        console.error('친구 요청 거절 오류:', error);
        throw error;
    }
};

export const getFriendRequests = async (userId) => {
    try {
        return await FriendRequest.find({
            to: userId,
            status: 'pending'
        }).populate('from', 'nickname profile tier');
    } catch (error) {
        console.error('친구 요청 조회 오류:', error);
        throw error;
    }
};

export const getPaginatedFriends = async (userId, page = 1, limit = 20) => {
    try {
        const user = await User.findById(userId)
            .populate({
                path: 'friends',
                select: 'nickname profile tier lastActive',
                options: {
                    skip: (page - 1) * limit,
                    limit: parseInt(limit)
                }
            });
        
        if (!user) {
            return { friends: [], total: 0, page, totalPages: 0 };
        }
        
        const totalFriends = user.friends.length;
        const totalPages = Math.ceil(totalFriends / limit);
        
        return {
            friends: user.friends,
            total: totalFriends,
            page: parseInt(page),
            totalPages
        };
    } catch (error) {
        console.error('친구 목록 조회 오류:', error);
        throw error;
    }
};

export const deleteFriend = async (userId, friendId) => {
    try {
        // 양방향 친구 관계 제거
        await User.findByIdAndUpdate(userId, {
            $pull: { friends: friendId }
        });
        
        await User.findByIdAndUpdate(friendId, {
            $pull: { friends: userId }
        });
        
        return true;
    } catch (error) {
        console.error('친구 삭제 오류:', error);
        throw error;
    }
};

// ===========================================
// 🚫 차단 관련 함수들
// ===========================================

export const blockUserService = async (userId, targetUserId) => {
    try {
        await User.findByIdAndUpdate(userId, {
            $addToSet: { blockedUsers: targetUserId },
            $pull: { friends: targetUserId }
        });
        
        // 상대방 친구 목록에서도 제거
        await User.findByIdAndUpdate(targetUserId, {
            $pull: { friends: userId }
        });
        
        return true;
    } catch (error) {
        console.error('사용자 차단 오류:', error);
        throw error;
    }
};

export const unblockUserService = async (userId, targetUserId) => {
    try {
        await User.findByIdAndUpdate(userId, {
            $pull: { blockedUsers: targetUserId }
        });
        
        return true;
    } catch (error) {
        console.error('사용자 차단 해제 오류:', error);
        throw error;
    }
};

export const getBlockedUsersService = async (userId) => {
    try {
        const user = await User.findById(userId)
            .populate('blockedUsers', 'nickname profile tier');
        
        return user ? user.blockedUsers : [];
    } catch (error) {
        console.error('차단된 사용자 목록 조회 오류:', error);
        throw error;
    }
};

// ===========================================
// ⭐ 평점 관련 함수들
// ===========================================

export const rateUser = async (raterUserId, ratedUserId, rating) => {
    try {
        // 평점 유효성 검사
        if (rating < 1 || rating > 5) {
            throw new Error('평점은 1-5 사이의 값이어야 합니다');
        }
        
        if (raterUserId === ratedUserId) {
            throw new Error('자신에게는 평점을 줄 수 없습니다');
        }
        
        // 기존 평점 확인
        const ratedUser = await User.findById(ratedUserId);
        if (!ratedUser) {
            throw new Error('평점을 받을 사용자를 찾을 수 없습니다');
        }
        
        // 평점 추가 (중복 평점 방지는 별도 로직 필요)
        const newRating = {
            rater: raterUserId,
            rating: rating,
            createdAt: new Date()
        };
        
        ratedUser.ratings = ratedUser.ratings || [];
        ratedUser.ratings.push(newRating);
        
        // 평균 평점 계산
        const totalRatings = ratedUser.ratings.length;
        const avgRating = ratedUser.ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings;
        ratedUser.averageRating = Math.round(avgRating * 100) / 100;
        
        await ratedUser.save();
        return ratedUser;
    } catch (error) {
        console.error('사용자 평점 오류:', error);
        throw error;
    }
};

// ===========================================
// 💬 채팅 관련 함수들
// ===========================================

export const decrementChatCount = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('사용자를 찾을 수 없습니다');
        }
        
        if (user.chatQuota && user.chatQuota.current > 0) {
            user.chatQuota.current -= 1;
            await user.save();
        }
        
        return user;
    } catch (error) {
        console.error('채팅 횟수 차감 오류:', error);
        throw error;
    }
};
