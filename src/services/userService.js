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
import {containsProfanity} from "../utils/profanityFilter.js";

// ============================================================================
//   소셜 로그인 관련 함수
// ============================================================================


// ✅ 개선된 카카오 로그인 - 복호화 없이 해시 기반으로만 처리
// 역할:
// 1. 카카오 ID 해시로 직접 검색 (복호화 없음)
// 2. 전화번호 해시로 기존 계정 찾기 (복호화 없음)
// 3. 기존 계정에 카카오 정보 연결
// 4. 완전 신규면 회원가입 필요 알림
export const findUserOrNoUser = async (kakaoUserData) => {
    try {
        const normalizedPhone = normalizePhoneNumber(kakaoUserData.phoneNumber);

        console.log("✅ [개선된 카카오 로그인] 해시 기반 검색 시작");
        console.log(`카카오 ID: ${kakaoUserData.kakaoId}, 전화번호: ${normalizedPhone}`);

        let existingUser = null;

        // 1단계: 카카오 ID 해시로 직접 검색 (가장 효율적)
        try {
            existingUser = await ComprehensiveEncryption.findUserBySocialId(
                User, 'kakao', kakaoUserData.kakaoId
            );
            if (existingUser) {
                console.log("✅ 카카오 해시 기반 사용자 발견");
            } else {
                console.log("🔍 카카오 해시 검색 결과: 없음");
            }
        } catch (error) {
            console.warn("⚠️ 카카오 해시 검색 실패:", error.message);
        }

        // 2단계: 구 방식 카카오 ID로 검색 (하위 호환성)
        if (!existingUser) {
            existingUser = await User.findOne({ 'social.kakao.providerId': kakaoUserData.kakaoId });
            if (existingUser) {
                console.log("✅ 구 방식 카카오 사용자 발견");
            }
        }

        // 3단계: 전화번호 해시로 기존 계정 찾기 (복호화 없음)
        if (!existingUser && normalizedPhone) {
            console.log("🔍 전화번호 해시로 기존 계정 검색 중...");

            const phoneHash = ComprehensiveEncryption.createPhoneHash(normalizedPhone);
            existingUser = await User.findOne({ phone_hash: phoneHash });

            if (existingUser && (!existingUser.social.kakao || !existingUser.social.kakao.providerId)) {
                console.log("✅ 전화번호 매칭으로 기존 계정 발견, 카카오 정보 연결 중...");

                // 기존 계정에 카카오 정보 추가 (암호화)
                const kakaoData = {
                    providerId: kakaoUserData.kakaoId,
                    providerId_hash: ComprehensiveEncryption.hashProviderId(kakaoUserData.kakaoId),
                    name: await ComprehensiveEncryption.encryptPersonalInfo(kakaoUserData.name),
                    phoneNumber: await ComprehensiveEncryption.encryptPersonalInfo(kakaoUserData.phoneNumber),
                    birthday: await ComprehensiveEncryption.encryptPersonalInfo(kakaoUserData.birthday.toString()),
                    birthyear: await ComprehensiveEncryption.encryptPersonalInfo(kakaoUserData.birthyear.toString()),
                    gender: kakaoUserData.gender,
                };

                existingUser.social.kakao = kakaoData;
                existingUser.markModified('social');
                await existingUser.save();
                await IntelligentCache.invalidateUserCache(existingUser._id);
                console.log("✅ 기존 계정에 카카오 정보 연결 완료");
                return await _attachCalculatedAge(existingUser);
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

        return await _attachCalculatedAge(existingUser);
    } catch (error) {
        console.error('User service error:', error.message);
        throw error;
    }
};
// ✅ 개선된 네이버 로그인 - 복호화 없이 해시 기반으로만 처리
// 역할:
// 1. 네이버 ID 해시로 직접 검색 (복호화 없음)
// 2. 전화번호 해시로 기존 계정 찾기 (복호화 없음)
// 3. 기존 계정에 네이버 정보 연결
// 4. 완전 신규면 회원가입 필요 알림
export const findUserByNaver = async (naverUserData) => {
    try {
        const normalizedPhone = normalizePhoneNumber(naverUserData.phoneNumber);

        console.log("✅ [개선된 네이버 로그인] 해시 기반 검색 시작");
        console.log(`네이버 ID: ${naverUserData.naverId}, 전화번호: ${normalizedPhone}`);

        let existingUser = null;

        // 1단계: 네이버 ID 해시로 직접 검색 (가장 효율적)
        try {
            existingUser = await ComprehensiveEncryption.findUserBySocialId(
                User, 'naver', naverUserData.naverId
            );
            if (existingUser) {
                console.log("✅ 네이버 해시 기반 사용자 발견");
            } else {
                console.log("🔍 네이버 해시 검색 결과: 없음");
            }
        } catch (error) {
            console.warn("⚠️ 네이버 해시 검색 실패:", error.message);
        }

        // 2단계: 구 방식 네이버 ID로 검색 (하위 호환성)
        if (!existingUser) {
            existingUser = await User.findOne({ 'social.naver.providerId': naverUserData.naverId });
            if (existingUser) {
                console.log("✅ 구 방식 네이버 사용자 발견");
            }
        }

        // 3단계: 전화번호 해시로 기존 계정 찾기 (복호화 없음)
        if (!existingUser && normalizedPhone) {
            console.log("🔍 전화번호 해시로 기존 계정 검색 중...");

            const phoneHash = ComprehensiveEncryption.createPhoneHash(normalizedPhone);
            existingUser = await User.findOne({ phone_hash: phoneHash });

            if (existingUser && (!existingUser.social.naver || !existingUser.social.naver.providerId)) {
                console.log("✅ 전화번호 매칭으로 기존 계정 발견, 네이버 정보 연결 중...");

                // 기존 계정에 네이버 정보 추가 (암호화)
                const naverData = {
                    providerId: naverUserData.naverId,
                    providerId_hash: ComprehensiveEncryption.hashProviderId(naverUserData.naverId),
                    name: await ComprehensiveEncryption.encryptPersonalInfo(naverUserData.name),
                    phoneNumber: await ComprehensiveEncryption.encryptPersonalInfo(naverUserData.phoneNumber),
                    birthday: await ComprehensiveEncryption.encryptPersonalInfo(naverUserData.birthday),
                    birthyear: await ComprehensiveEncryption.encryptPersonalInfo(naverUserData.birthyear.toString()),
                    gender: naverUserData.gender,
                    accessToken: naverUserData.accessToken || '',
                };

                existingUser.social.naver = naverData;
                existingUser.markModified('social');
                await existingUser.save();
                await IntelligentCache.invalidateUserCache(existingUser._id);
                console.log("✅ 기존 계정에 네이버 정보 연결 완료");
                return existingUser;
            }
        }

        // 4단계: 신규 사용자 처리
        if (!existingUser) {
            console.log('✅ 등록된 네이버 사용자가 없습니다. 회원가입이 필요합니다.');
            return { status: 'noUser', ...naverUserData };
        }

        // 5단계: 비활성화 계정 처리
        if (existingUser.status === 'deactivated') {
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            if (existingUser.deactivatedAt && (new Date().getTime() - existingUser.deactivatedAt.getTime()) < sevenDays) {
                const remainingTime = existingUser.deactivatedAt.getTime() + sevenDays - new Date().getTime();
                const remainingDays = Math.ceil(remainingTime / (1000 * 60 * 60 * 24));
                throw new Error(`회원 탈퇴 후 7일 동안 재가입할 수 없습니다. ${remainingDays}일 남았습니다.`);
            } else {
                return { status: 'reactivation_possible', user: { _id: existingUser._id, nickname: existingUser.nickname, email: existingUser.email } };
            }
        }

        console.log("✅ 네이버 로그인 처리 완료");
        return await _attachCalculatedAge(existingUser);
    } catch (error) {
        console.error('네이버 로그인 처리 실패:', error.message);
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

/**
 * 🎯 사용자 상세 정보 조회 (최적화 + 안전성 보장)
 *
 * 핵심 전략:
 * 1. 캐싱: 변하지 않는 정보(nickname, photo 등)는 캐시에서 빠르게 로드
 * 2. 실시간 계산: numOfChat은 매번 실시간으로 계산 (정확성 보장)
 * 3. 조건부 업데이트: Race Condition 방지로 데이터 손실 없음
 *
 * @param {string} userId - 조회할 사용자 ID
 * @returns {Object} 사용자 정보 (numOfChat은 실시간 계산된 값)
 */
export const getUserById = async (userId) => {
    try {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 📦 1단계: 캐시에서 정적 정보 조회 시도
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 정적 정보: nickname, profilePhoto, gender, star 등 (거의 변하지 않는 데이터)
        // TTL: 30분 (1800초)
        let cachedStaticInfo = await IntelligentCache.getUserStaticInfo(userId);

        let user;

        if (cachedStaticInfo) {
            // ✅ 캐시 HIT: 빠른 로드 (DB 조회 없음)
            console.log(`💾 [캐시 HIT] 사용자 정적 정보: ${userId}`);
            // 🔍 캐시 유효성 검증: DB에 사용자가 실제로 존재하는지 확인
            const exists = await User.exists({ _id: userId, status: { $ne: 'deactivated' } });

            if (!exists) {
                // ❌ 사용자가 존재하지 않음 → 캐시 무효화 후 에러
                console.log(`⚠️ [캐시 무효] 사용자가 DB에 없음: ${userId}`);
                await IntelligentCache.invalidateUserStaticInfo(userId);
                throw new Error("사용자를 찾을 수 없습니다.");
            }
            // ✅ 사용자 존재 확인 → 캐시 데이터 사용
            user = cachedStaticInfo;
        } else {
            // ❌ 캐시 MISS: DB 조회 필요
            console.log(`🔍 [캐시 MISS] DB 조회 시작: ${userId}`);

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 📊 2단계: MongoDB에서 사용자 정보 조회 (lean() 사용)
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // lean(): Mongoose Document가 아닌 일반 JavaScript 객체로 반환
            // 장점: 메모리 사용량 30-40% 감소, 조회 속도 2-3배 빠름
            // 단점: save(), populate() 등 Mongoose 메서드 사용 불가
            user = await User.findById(userId)
                .select({
                    _id: 1,
                    // 🎨 기본 프로필 정보
                    nickname: 1,
                    profilePhoto: 1,
                    gender: 1,
                    star: 1,
                    info: 1,
                    photo: 1,

                    // 🎮 게임 정보
                    lolNickname: 1,

                    // 💬 채팅 관련 (실시간 계산에 필요)
                    numOfChat: 1,        // DB에 저장된 값 (기준점)
                    chatTimer: 1,         // 마지막 충전 시각 (계산에 필요)
                    plan: 1,              // 요금제 정보 (maxChatCount 계산용)

                    // 🚫 신고 관련
                    reportStatus: 1,
                    reportTimer: 1,

                    // 🎂 나이 계산용
                    birthdate: 1,

                    // ⚙️ 설정 정보
                    wordFilterEnabled: 1,
                    friendReqEnabled: 1,
                    chatPreviewEnabled: 1,
                })
                .lean();  // ✅ lean() 사용 - 성능 최적화

            // 사용자가 존재하지 않으면 에러 발생
            if (!user) {
                throw new Error("사용자를 찾을 수 없습니다.");
            }



            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 💾 3단계: 정적 정보를 캐시에 저장
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // TTL: 1800초 (30분)
            // 캐시 대상: 모든 필드 (numOfChat, chatTimer 포함)
            // 이유: 실시간 계산의 기준점이 되므로 함께 저장
            await IntelligentCache.cacheUserStaticInfo(userId, user, 1800);
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 📸 4단계: 현재 DB 값 스냅샷 저장 (조건부 업데이트용)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 이 값들은 나중에 조건부 업데이트 시 "변경되지 않았는지" 확인하는 조건으로 사용
        // 중요: 이 시점의 DB 값을 정확히 기억해야 Race Condition 방지 가능
        const dbNumOfChat = user.numOfChat;    // 현재 DB의 채팅 횟수
        const dbChatTimer = user.chatTimer;    // 현재 DB의 충전 타이머

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ⚡ 5단계: 실시간 채팅 충전 계산
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // DB 업데이트 없이 메모리에서만 계산
        // 장점: 빠르고, 항상 최신 값 반환
        const rechargeResult = calculateRechargeRealtime(user);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🔄 6단계: 충전이 필요하면 조건부 업데이트 실행 (비동기)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // needsUpdate: 충전 시간이 지나서 DB 업데이트가 필요한 경우 true
        if (rechargeResult.needsUpdate) {
            console.log(`🔄 [충전 필요] 사용자: ${userId}, ${dbNumOfChat} → ${rechargeResult.newNumOfChat}`);


            //  먼저 캐시 무효화, 그 다음 비동기 업데이트
            await IntelligentCache.invalidateUserStaticInfo(userId);
            // ✅ 조건부 업데이트 실행 (비동기 - 응답 속도에 영향 없음)
            // then/catch로 처리하여 메인 흐름을 차단하지 않음
            updateChatCountSafely(
                userId,
                dbNumOfChat,                      // 조건: 현재 DB 값
                dbChatTimer,                      // 조건: 현재 타이머 값
                rechargeResult.newNumOfChat,      // 새로 저장할 채팅 횟수
                rechargeResult.newChatTimer       // 새로 저장할 타이머
            ).catch(err => {
                // 업데이트 실패해도 응답은 정상 처리 (다음 요청 때 재시도)
                console.error(`❌ [충전 업데이트 실패] ${userId}:`, err.message);
            });
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 📦 7단계: 클라이언트에 전달할 데이터 구성
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const data = {
            _id: user._id.toString(),           // ✅ ObjectId를 문자열로 변환 (중요!)

            // 🎨 프로필 정보
            nickname: user.nickname,
            profilePhoto: user.profilePhoto,
            gender: user.gender,
            star: user.star,
            lolNickname: user.lolNickname,
            info: user.info,
            photo: user.photo || [],

            // ⚙️ 설정 정보
            wordFilterEnabled: user.wordFilterEnabled,
            friendReqEnabled: user.friendReqEnabled,
            chatPreviewEnabled: user.chatPreviewEnabled,

            // 💬 채팅 정보 (실시간 계산된 값!)
            numOfChat: rechargeResult.currentNumOfChat,      // ✅ 실시간 계산된 현재 채팅 횟수
            maxChatCount: rechargeResult.maxChatCount,       // 최대 채팅 횟수
            nextRefillAt: rechargeResult.nextRefillAt,       // ✅ 다음 충전 시각

            // 🎂 나이 계산용 원본 데이터
            birthdate: user.birthdate,                        // 암호화된 생년월일

            // 📊 추가 정보 (프론트엔드에서 실시간 계산 가능하도록)
            chatTimer: user.chatTimer,                        // 마지막 충전 시각
            planType: user.plan?.planType                     // 요금제 타입
        };

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🎂 8단계: 나이 정보 계산 및 추가
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // birthdate가 있으면 만나이, 연령대, 미성년자 여부 계산
        if (user.birthdate) {
            try {
                // 캐시에서 나이 정보 확인 (복호화 비용 절약)
                const ageInfo = await IntelligentCache.getCachedUserAge(userId);

                if (ageInfo) {
                    // ✅ 캐시 HIT: 복호화 없이 바로 사용
                    data.calculatedAge = ageInfo.age;
                    data.ageGroup = ageInfo.ageGroup;
                    data.isMinor = ageInfo.isMinor;
                    console.log(`💾 [캐시] 나이 정보: ${userId} - ${ageInfo.age}세`);
                } else {
                    // ❌ 캐시 MISS: 복호화 후 계산
                    console.log(`🔓 [복호화] birthdate: ${userId}`);

                    let decryptedBirthdate;
                    try {
                        decryptedBirthdate = await ComprehensiveEncryption.decryptPersonalInfo(user.birthdate);
                    } catch (decryptError) {
                        console.error(`❌ birthdate 복호화 실패 (${userId}):`, decryptError.message);
                        decryptedBirthdate = null;
                    }

                    if (decryptedBirthdate) {
                        try {
                            const age = ComprehensiveEncryption.calculateAge(decryptedBirthdate);
                            const ageGroup = ComprehensiveEncryption.getAgeGroup(decryptedBirthdate);
                            const isMinor = ComprehensiveEncryption.isMinor(decryptedBirthdate);

                            data.calculatedAge = age;
                            data.ageGroup = ageGroup;
                            data.isMinor = isMinor;

                            await IntelligentCache.cacheUserAge(userId, age, ageGroup, isMinor);
                            console.log(`✅ [캐싱] 나이 정보: ${userId} - ${age}세`);

                        } catch (calcError) {
                            console.error(`❌ 나이 계산 실패 (${userId}):`, calcError.message);
                            data.calculatedAge = null;
                            data.ageGroup = null;
                            data.isMinor = null;
                        }

                    } else {
                        console.warn(`⚠️ birthdate 복호화 실패, 나이 정보 제외: ${userId}`);
                        data.calculatedAge = null;
                        data.ageGroup = null;
                        data.isMinor = null;
                    }
                }
            } catch (error) {
                // 나이 계산 실패해도 다른 정보는 정상 반환
                console.error('⚠️ 만나이 정보 조회 실패:', error);
            }
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ 9단계: 최종 데이터 반환
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        return data;

    } catch (err) {
        // 에러 발생 시 상세 로그 출력
        console.error(`❌ [getUserById 에러] ${userId}:`, err.message);
        throw new Error(err.message);
    }
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔧 헬퍼 함수: 실시간 채팅 충전 계산 (DB 업데이트 없이)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * 채팅 충전 시간 계산 (메모리에서만 계산, DB 업데이트 없음)
 *
 * 계산 로직:
 * 1. 현재 시각과 마지막 충전 시각(chatTimer)의 차이 계산
 * 2. 차이를 충전 주기(REFILL_MS)로 나눈 몫 = 충전 횟수
 * 3. 현재 채팅 횟수 + 충전 횟수 (최대값 제한)
 *
 * @param {Object} user - 사용자 정보 (lean() 객체)
 * @returns {Object} 계산 결과
 *   - currentNumOfChat: 실시간 계산된 현재 채팅 횟수
 *   - maxChatCount: 최대 채팅 횟수
 *   - nextRefillAt: 다음 충전 시각
 *   - needsUpdate: DB 업데이트 필요 여부
 *   - newNumOfChat: DB에 저장할 새 채팅 횟수
 *   - newChatTimer: DB에 저장할 새 타이머
 */
function calculateRechargeRealtime(user) {
    // 🔢 1단계: 최대 채팅 횟수 계산
    const max = getMax(user.plan?.planType);    // 요금제별 최대 횟수
    const dbNumOfChat = user.numOfChat || 0;     // DB에 저장된 현재 횟수

    let currentNumOfChat = dbNumOfChat;          // 계산할 현재 횟수 (초기값 = DB 값)
    let needsUpdate = false;                     // DB 업데이트 필요 여부
    let newNumOfChat = dbNumOfChat;              // DB에 저장할 값
    let newChatTimer = user.chatTimer;           // DB에 저장할 타이머

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔍 2단계: 이미 풀충전인 경우 (계산 불필요)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (dbNumOfChat >= max) {
        const last = user.chatTimer ?? new Date();
        const nextRefillAt = new Date(new Date(last).getTime() + REFILL_MS);

        return {
            currentNumOfChat: dbNumOfChat,    // 이미 최대값
            maxChatCount: max,
            nextRefillAt,
            needsUpdate: false                // 업데이트 불필요
        };
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ⏰ 3단계: 충전 시간 계산
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ✅✅✅ 여기부터 완전히 새로운 코드! ✅✅✅
    let last;
    if (user.chatTimer) {
        const parsedDate = new Date(user.chatTimer);

        if (isNaN(parsedDate.getTime())) {
            console.warn(`⚠️ chatTimer가 유효하지 않음 (userId: ${user._id}):`, user.chatTimer);
            last = new Date();
        } else {
            last = parsedDate;
        }
    } else {
        last = new Date();
    }

    const now = Date.now();
    const elapsed = now - last.getTime();

    if (elapsed < 0) {
        console.warn(`⚠️ 경과 시간이 음수 (userId: ${user._id}): ${elapsed}ms`);
        return {
            currentNumOfChat: dbNumOfChat,
            maxChatCount: max,
            nextRefillAt: new Date(Date.now() + REFILL_MS),
            needsUpdate: true,
            newNumOfChat: dbNumOfChat,
            newChatTimer: new Date()
        };
    }

    if (isNaN(elapsed)) {
        console.error(`❌ 경과 시간 계산 오류 (userId: ${user._id})`);
        return {
            currentNumOfChat: dbNumOfChat,
            maxChatCount: max,
            nextRefillAt: new Date(Date.now() + REFILL_MS),
            needsUpdate: false
        };
    }





    const quota = Math.floor(elapsed / REFILL_MS);  // 충전 횟수 (소수점 버림)

    // 예시:
    // REFILL_MS = 1,200,000ms (20분)
    // elapsed = 2,500,000ms (41분 40초)
    // quota = floor(2,500,000 / 1,200,000) = floor(2.08) = 2회 충전

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ✅ 4단계: 충전이 필요한 경우
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (quota > 0) {
        // 충전 시간이 지났음! (예: 20분 경과)

        // 새 채팅 횟수 계산 (최대값 초과 방지)
        currentNumOfChat = Math.min(max, dbNumOfChat + quota);

        // DB 업데이트 필요 플래그 설정
        needsUpdate = true;
        newNumOfChat = currentNumOfChat;

        // 새 타이머 계산
        // 예: 2회 충전 → 타이머를 40분(20분 × 2) 앞으로 이동
        const advanced = new Date(last.getTime() + quota * REFILL_MS);
        newChatTimer = currentNumOfChat >= max ? null : advanced;
        // null인 경우: 풀충전 완료 (타이머 리셋)
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 📅 5단계: 다음 충전 시각 계산
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const nextRefillAt = new Date(new Date(last).getTime() + REFILL_MS);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🎁 6단계: 계산 결과 반환
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    return {
        currentNumOfChat,     // 클라이언트에 표시할 값 (실시간 계산)
        maxChatCount: max,
        nextRefillAt,
        needsUpdate,          // true면 DB 업데이트 필요
        newNumOfChat,         // DB에 저장할 값
        newChatTimer          // DB에 저장할 타이머
    };
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🛡️ 헬퍼 함수: 조건부 안전 업데이트 (Race Condition 방지)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * 채팅 횟수 조건부 업데이트 (동시성 문제 방지)
 *
 * 핵심 개념:
 * - Optimistic Locking 방식
 * - DB 값이 예상한 값과 일치할 때만 업데이트
 * - 값이 변경되었다면 업데이트 스킵 (데이터 손실 방지)
 *
 * 동작 시나리오:
 *
 * [성공 케이스]
 * 1. 조회 시점: numOfChat = 10
 * 2. 계산: numOfChat = 60으로 충전
 * 3. 업데이트 시도: "numOfChat이 10인 경우에만 60으로 변경"
 * 4. DB 확인: 여전히 10 ✅
 * 5. 업데이트 성공!
 *
 * [스킵 케이스 - 동시 수정 발생]
 * 1. 조회 시점: numOfChat = 10
 * 2. 계산: numOfChat = 60으로 충전
 * 3. (다른 요청) 사용자가 채팅 사용 → numOfChat = 9
 * 4. 업데이트 시도: "numOfChat이 10인 경우에만 60으로 변경"
 * 5. DB 확인: 현재 9 ❌ (조건 불일치)
 * 6. 업데이트 스킵! (9 유지 → 채팅 사용 이력 보존)
 *
 * @param {string} userId - 사용자 ID
 * @param {number} oldNumOfChat - 조회 시점의 채팅 횟수 (조건)
 * @param {Date} oldChatTimer - 조회 시점의 타이머 (조건)
 * @param {number} newNumOfChat - 저장할 새 채팅 횟수
 * @param {Date} newChatTimer - 저장할 새 타이머
 */
async function updateChatCountSafely(userId, oldNumOfChat, oldChatTimer, newNumOfChat, newChatTimer) {
    try {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🛡️ [조건부 업데이트 시작]');
        console.log(`   사용자 ID: ${userId}`);
        console.log(`   조건(현재 값): numOfChat = ${oldNumOfChat}, chatTimer = ${oldChatTimer}`);
        console.log(`   새 값: numOfChat = ${newNumOfChat}, chatTimer = ${newChatTimer}`);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🔍 findOneAndUpdate: 조건을 만족하는 문서만 업데이트
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const result = await User.findOneAndUpdate(
            {
                // ✅ WHERE 조건: 이 조건을 모두 만족해야 업데이트 실행
                _id: userId,                    // 사용자 ID 일치
                numOfChat: oldNumOfChat,        // 채팅 횟수가 조회 시점과 동일
                chatTimer: oldChatTimer         // 타이머가 조회 시점과 동일

                // 💡 핵심: 이 두 값이 하나라도 변경되었다면 업데이트 안 함!
                // 예: 다른 요청에서 채팅 사용 → numOfChat 변경 → 조건 불일치 → 스킵
            },
            {
                // ✅ SET: 조건이 맞으면 이 값들로 업데이트
                $set: {
                    numOfChat: newNumOfChat,    // 새 채팅 횟수
                    chatTimer: newChatTimer     // 새 타이머
                }
            },
            {
                new: true,      // 업데이트된 문서 반환 (업데이트 후 값)
                lean: true      // 일반 객체로 반환 (성능 최적화)
            }
        );

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ 결과 확인
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (result) {
            // result가 null이 아님 = 조건을 만족하는 문서를 찾아 업데이트 성공
            console.log(`✅ [업데이트 성공] numOfChat: ${oldNumOfChat} → ${newNumOfChat}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        } else {


            // result가 null = 조건을 만족하는 문서를 찾지 못함 = 값이 이미 변경됨
            console.log(`⚠️ [업데이트 스킵] DB 값이 이미 변경되었습니다 (동시 수정 발생)`);
            console.log(`   → 다른 요청에서 이미 값을 수정했거나, 사용자가 채팅을 사용했을 가능성`);
            console.log(`   → 안전을 위해 업데이트하지 않음 (데이터 손실 방지)`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            await IntelligentCache.invalidateUserStaticInfo(userId);
            console.log('   ✅ 캐시 무효화 완료');
            return false;
        }
    } catch (error) {
        console.error('❌ [실패] 조건부 업데이트 중 오류 발생');

        // ✅✅✅ 여기부터 새로운 코드! ✅✅✅
        try {
            await IntelligentCache.invalidateUserStaticInfo(userId);
            console.log('   ✅ 오류 후 캐시 무효화 완료');
        } catch (cacheError) {
            console.error('   ❌ 캐시 무효화 실패:', cacheError.message);
        }
        return false;
    }
}


// ============================================================================
//   인증 전용 사용자 조회 함수
// ============================================================================


 // 인증용 사용자 정보 조회 (getCurrentUser 전용)
 // 로그인 유지에 필요한 최소한의 정보만 반환
 // getUserById()보다 훨씬 가벼움 (채팅 할당량 계산 제외)
 // 페이지 새로고침 시 로그인 유지를 위해 사용

export const getUserForAuth = async (userId) => {
    try {
        const user = await User.findById(userId)
            .select({
                _id: 1,
                nickname: 1,
                status: 1,
                userLv: 1,
                birthdate: 1
            })
            .lean();

        if (!user) {
            throw new Error("사용자를 찾을 수 없습니다.");
        }

        // ✅ ObjectId를 문자열로 변환 (중요!)
        user._id = user._id.toString();

        // 🔧 DB 조회 직후 즉시 로그
        console.log('📊 [getUserForAuth] DB 조회 직후:', {
            userId: user._id,
            userIdType: typeof user._id,
            nickname: user.nickname,
            status: user.status,
            userLv: user.userLv,
            hasUserLv: 'userLv' in user,
            userLvType: typeof user.userLv,
            allFields: Object.keys(user)
        });

        // ✅ 나이 정보 계산 추가 (캐시 우선)
        if (user.birthdate) {
            try {
                const ageInfo = await IntelligentCache.getCachedUserAge(userId);
                if (ageInfo) {
                    // 캐시에서 가져오기
                    user.calculatedAge = ageInfo.age;
                    user.ageGroup = ageInfo.ageGroup;
                    user.isMinor = ageInfo.isMinor;
                    console.log(`💾 [인증-캐시] 나이 정보 로드: ${userId} - ${ageInfo.age}세`);
                } else {
                    // 캐시 미스: 복호화 후 계산
                    console.log(`🔓 [인증] birthdate 복호화 시작: ${userId}`);
                    const decryptedBirthdate = await ComprehensiveEncryption.decryptPersonalInfo(user.birthdate);

                    if (decryptedBirthdate) {
                        const age = ComprehensiveEncryption.calculateAge(decryptedBirthdate);
                        const ageGroup = ComprehensiveEncryption.getAgeGroup(decryptedBirthdate);
                        const isMinor = ComprehensiveEncryption.isMinor(decryptedBirthdate);

                        user.calculatedAge = age;
                        user.ageGroup = ageGroup;
                        user.isMinor = isMinor;

                        // 캐시 저장
                        await IntelligentCache.cacheUserAge(userId, age, ageGroup, isMinor);
                        console.log(`✅ [인증-캐싱] 나이 정보 저장: ${userId} - ${age}세`);
                    }
                }
            } catch (error) {
                console.error(`⚠️ [인증] 나이 정보 계산 실패: ${userId}`, error);
                // 에러가 나도 인증은 통과시킴 (나이 정보는 null)
            }
        }

        console.log(`✅ [인증] 사용자 정보 조회 성공: ${userId}`, {
            nickname: user.nickname,
            hasBirthdate: !!user.birthdate,
            ageGroup: user.ageGroup,
            age: user.calculatedAge
        });

        return user;
    } catch (err) {
        console.error(`❌ [인증] 사용자 정보 조회 실패: ${userId}`, err.message);
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

            // 🔧 [최적화] birthdate가 있을 때만 만나이 계산 (캐시 우선)
            if (user.birthdate) {
                try {
                    // 캐시에서 나이 정보 확인
                    const cachedAge = await IntelligentCache.getCachedUserAge(user._id);
                    if (cachedAge) {
                        userInfo.age = cachedAge.age;
                        userInfo.ageGroup = cachedAge.ageGroup;
                        userInfo.isMinor = cachedAge.isMinor;
                        console.log(`💾 [최적화] 캐시에서 나이 로드: ${user._id}`);
                    } else {
                        // 캐시가 없을 때만 복호화
                        console.log(`🔓 [최적화] birthdate 복호화 필요: ${user._id}`);
                        const decryptedBirthdate = await ComprehensiveEncryption.decryptPersonalInfo(user.birthdate);
                        if (decryptedBirthdate) {
                            userInfo.age = ComprehensiveEncryption.calculateAge(decryptedBirthdate);
                            userInfo.ageGroup = ComprehensiveEncryption.getAgeGroup(decryptedBirthdate);
                            userInfo.isMinor = ComprehensiveEncryption.isMinor(decryptedBirthdate);

                            // 캐시 저장
                            await IntelligentCache.cacheUserAge(user._id, userInfo.age, userInfo.ageGroup, userInfo.isMinor);
                            console.log(`✅ [최적화] 나이 정보 캐싱: ${user._id} -> ${userInfo.age}세`);
                        }
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
        if (userData.info && containsProfanity(userData.info)) {
            throw new Error('자기소개에 비속어를 사용할 수 없습니다.');
        }

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

        return await _attachCalculatedAge(savedUser);

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

/**
 * 사용자 객체에 calculatedAge, ageGroup, isMinor를 계산하여 추가하는 헬퍼 함수
 * @param {object} user - Mongoose 사용자 문서 또는 lean object
 * @returns {Promise<object>} - 나이 정보가 추가된 사용자 객체
 */
const _attachCalculatedAge = async (user) => {
    if (!user || !user.birthdate) {
        return user.toObject ? user.toObject() : user;
    }

    try {
        // toObject()를 호출하여 Mongoose 문서가 아닌 일반 객체로 만듭니다.
        const userObject = typeof user.toObject === 'function' ? user.toObject() : { ...user };

        const ageInfo = await IntelligentCache.getCachedUserAge(userObject._id);
        if (ageInfo) {
            userObject.calculatedAge = ageInfo.age;
            userObject.ageGroup = ageInfo.ageGroup;
            userObject.isMinor = ageInfo.isMinor;
        } else {
            const decryptedBirthdate = await ComprehensiveEncryption.decryptPersonalInfo(userObject.birthdate);
            if (decryptedBirthdate) {
                const age = ComprehensiveEncryption.calculateAge(decryptedBirthdate);
                const ageGroup = ComprehensiveEncryption.getAgeGroup(decryptedBirthdate);
                const isMinor = ComprehensiveEncryption.isMinor(decryptedBirthdate);

                userObject.calculatedAge = age;
                userObject.ageGroup = ageGroup;
                userObject.isMinor = isMinor;

                // 캐시 저장
                await IntelligentCache.cacheUserAge(userObject._id, age, ageGroup, isMinor);
            }
        }
        return userObject;
    } catch (error) {
        console.error(`_attachCalculatedAge 에러 (${user._id}):`, error);
        // 에러 발생 시에도 원본 사용자 객체(또는 plain object)를 반환
        return typeof user.toObject === 'function' ? user.toObject() : { ...user };
    }
};

