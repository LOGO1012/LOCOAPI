import {ChatRoom, ChatMessage, ChatRoomExit, RoomEntry} from '../models/chat.js';
import {User} from "../models/UserProfile.js";
import {ChatRoomHistory} from "../models/chatRoomHistory.js";
import ChatEncryption from '../utils/encryption/chatEncryption.js';
import ComprehensiveEncryption from '../utils/encryption/comprehensiveEncryption.js';
import ReportedMessageBackup from '../models/reportedMessageBackup.js';
import {filterProfanity} from '../utils/profanityFilter.js';
import IntelligentCache from '../utils/cache/intelligentCache.js';
import {getAgeInfoUnified} from './userService.js';
import {CacheKeys, invalidateExitedRooms} from '../utils/cache/cacheKeys.js';
import mongoose from 'mongoose';

/**
 * 새로운 채팅방 생성
 */
export const createChatRoom = async (roomType, capacity, matchedGender, ageGroup) => {
    try {
        console.log('🏠 [createChatRoom] 요청 매개변수:');
        console.log(`  - roomType: ${roomType}`);
        console.log(`  - capacity: ${capacity}`);
        console.log(`  - matchedGender: ${matchedGender}`);
        console.log(`  - ageGroup: "${ageGroup}" (type: ${typeof ageGroup})`);

        // 1) 방 생성
        const newChatRoom = new ChatRoom({roomType, capacity, matchedGender, ageGroup});
        const saved = await newChatRoom.save();

        console.log('✅ [createChatRoom] 방 생성 성공:', saved._id);
        return saved;
    } catch (error) {
        // 에러 스택까지 찍어서 어디서 터졌는지 확인
        console.error('[chatService.createChatRoom] error:', error);
        throw error;
    }
};

// 친구와 채팅방 생성
export const createFriendRoom = async (roomType, capacity) => {
    try {
        const newChatRoom = new ChatRoom({
            roomType,
            capacity
        });
        return await newChatRoom.save();
    } catch (error) {
        throw new Error(error.message);
    }
}

// 차등 TTL 함수 추가
const getChatRoomCacheTTL = (room) => {
    switch (room.roomType) {
        case 'friend':
            return 600;  // 10분
        case 'random':
            return 300;  // 5분
        default:
            return 60;         // 1분
    }
};

/**
 * 특정 채팅방 조회
 */
export const getChatRoomById = async (roomId) => {
    // ✅ 1. 캐시 조회
    const cacheKey = CacheKeys.CHAT_ROOM(roomId);
    const cached = await IntelligentCache.getCache(cacheKey);

    if (cached) {
        console.log(`💾 [캐시 HIT] 채팅방: ${roomId}`);
        return cached;
    }

    // ✅ 2. 캐시 미스 → DB 조회
    console.log(`🔍 [캐시 MISS] 채팅방: ${roomId}`);
    const room = await ChatRoom.findById(roomId)
        .populate('chatUsers', '_id nickname profilePhoto gender')
        .lean();  // ✅ 성능 최적화

    if (!room) return null;

    // 3. ✅ 차등 TTL 캐싱
    const ttl = getChatRoomCacheTTL(room);
    await IntelligentCache.setCache(cacheKey, room, ttl);
    console.log(`💾 [캐싱] 채팅방: ${roomId} (타입: ${room.roomType}, TTL: ${ttl}초)`);

    return room;
};

/**
 * 모든 채팅방 목록 조회 (서버측 필터링 및 페이징 적용)
 * @param {object} filters - 쿼리 파라미터 객체 (roomType, capacity, matchedGender, ageGroup, status, page, limit 등)
 */
/**
 * 모든 채팅방 목록 조회 (N+1 쿼리 해결 + Redis 캐싱)
 * @param {object} filters - 쿼리 파라미터 객체
 */
export const getAllChatRooms = async (filters) => {
    try {

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🆕 1. 캐시 조회 (특정 사용자 첫 페이지만) - 추가된 부분
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (filters.chatUsers && !filters.lastId) {
            const cacheKey = `active_rooms:${filters.chatUsers}`;
            const cached = await IntelligentCache.getCache(cacheKey);

            if (cached) {
                console.log(`💾 [캐시 HIT] 활성방: ${filters.chatUsers}`);
                return cached;
            }

            console.log(`🔍 [캐시 MISS] 활성방 DB 조회: ${filters.chatUsers}`);
        }
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        const query = {};

        // 차단된 사용자 포함 방 제외 (Redis 캐싱 적용)
        if (filters.userId) {
            console.log(`📋 [getAllChatRooms] 사용자 ${filters.userId}의 방 목록 조회 시작`);
            // 1. 사용자 차단 목록 캐싱 (5분)
            const myBlocksCacheKey = `user_blocks_${filters.userId}`;
            let userBlocks = await IntelligentCache.getCache(myBlocksCacheKey);

            if (!userBlocks) {
                const me = await User.findById(filters.userId)
                    .select('blockedUsers')
                    .lean();

                userBlocks = me?.blockedUsers?.map(id => id.toString()) || [];

                await IntelligentCache.setCache(myBlocksCacheKey, userBlocks, 3600); // 5분 TTL
                console.log(`💾 [getAllChatRooms] 캐시 저장: 내가 차단한 사람 ${userBlocks.length}명 (TTL: 1시간)`);
            } else {
                console.log(`✅ [getAllChatRooms] 캐시 히트: 내가 차단한 사람 ${userBlocks.length}명`);
            }
            // ─────────────────────────────────────────────────────
            // 2️⃣ 나를 차단한 사람 목록 (캐싱 적용)
            // ─────────────────────────────────────────────────────
            const blockedMeCacheKey = `users_blocked_me_${filters.userId}`;
            let blockedMeIds = await IntelligentCache.getCache(blockedMeCacheKey);

            if (!blockedMeIds) {
                console.log(`🔍 [getAllChatRooms] 캐시 미스: 나를 차단한 사람 목록 DB 조회`);

                const blockedMeUsers = await User.find({
                    blockedUsers: filters.userId
                })
                    .select('_id')
                    .lean();

                blockedMeIds = blockedMeUsers.map(u => u._id.toString());

                // 1시간 캐싱
                await IntelligentCache.setCache(blockedMeCacheKey, blockedMeIds, 3600);
                console.log(`💾 [getAllChatRooms] 캐시 저장: 나를 차단한 사람 ${blockedMeIds.length}명 (TTL: 1시간)`);
            } else {
                console.log(`✅ [getAllChatRooms] 캐시 히트: 나를 차단한 사람 ${blockedMeIds.length}명`);
            }

            // ─────────────────────────────────────────────────────
            // 3️⃣ 전체 차단 목록 (양방향 합치기)
            // ─────────────────────────────────────────────────────
            const allBlockedIds = [...new Set([...userBlocks, ...blockedMeIds])];
            console.log(`🔒 [getAllChatRooms] 전체 차단 목록: ${allBlockedIds.length}명 (내가 차단: ${userBlocks.length}, 나를 차단: ${blockedMeIds.length})`);

            // ─────────────────────────────────────────────────────
            // 4️⃣ 퇴장한 방 목록 조회
            // ─────────────────────────────────────────────────────

            // 2. 퇴장한 방 목록 조회
            const exitedCacheKey = CacheKeys.USER_EXITED_ROOMS(filters.userId);
            let exited = await IntelligentCache.getCache(exitedCacheKey);

            if (!exited) {
                console.log(`🔍 [getAllChatRooms] 캐시 미스: 퇴장 목록 DB 조회`);
                exited = await ChatRoomExit //.distinct('chatRoom', {user: filters.userId}); 주석후 아래 4줄 추가
                    .find({user: filters.userId})
                    .select('chatRoom -_id')  // chatRoom만 조회
                    .lean()  // Plain object로 반환 (Mongoose 오버헤드 제거)
                    .then(docs => docs.map(doc => doc.chatRoom));

                // 15분 TTL로 캐싱
                await IntelligentCache.setCache(exitedCacheKey, exited, 900);
                if (process.env.NODE_ENV === 'development') {
                    console.log(`💾 [캐시저장] 퇴장방 ${exited.length}개 (TTL: 15분)`);
                }

            } else {
                if (process.env.NODE_ENV === 'development') {
                    console.log(`✅ [캐시HIT] 퇴장방 ${exited.length}개`);
                }
            }

            // ✅ invalidateExitedRooms 제거 - 캐시 저장 직후 즉시 무효화하는 버그였음
            // 퇴장방 캐시 무효화는 실제 퇴장/재입장 시에만 수행해야 함

            console.log(`🚪 [getAllChatRooms] 퇴장한 방: ${exited.length}개`);

            if (exited.length > 0) {
                query._id = {$nin: exited};
            }
            if (userBlocks.length > 0) {
                query.chatUsers = {$nin: userBlocks};
            }
        }

        // 필터 조건 추가
        if (filters.chatUsers) {
            query.chatUsers = filters.chatUsers;
        }
        if (filters.roomType) {
            query.roomType = filters.roomType;
        }
        if (filters.capacity) {
            query.capacity = parseInt(filters.capacity);
        }
        if (filters.isActive !== undefined) {
            query.isActive = filters.isActive === 'true' || filters.isActive === true;
        }
        if (filters.matchedGender) {
            query.matchedGender = filters.matchedGender;
        }
        if (filters.ageGroup) {
            query.ageGroup = filters.ageGroup;
        }

        console.log(`🔎 [getAllChatRooms] 최종 쿼리 조건:`, JSON.stringify(query, null, 2));


        // 페이지네이션

        const limit = parseInt(filters.limit) || 10;
        const lastId = filters.lastId; // 마지막으로 본 방 ID

        // lastId가 있으면 그 이후 방만 조회
        if (lastId) {
            query._id = query._id
                ? {...query._id, $lt: new mongoose.Types.ObjectId(lastId)}
                : {$lt: new mongoose.Types.ObjectId(lastId)};
        }


        console.log(`📃 [getAllChatRooms] Cursor 페이징: limit=${limit}, lastId=${lastId || 'none'}`);

        const startTime = Date.now();

        // 3. 집계 파이프라인으로 N+1 해결 (402개 쿼리 → 1개) -> // Aggregation 파이프라인
        const rooms = await ChatRoom.aggregate([
            {$match: query},
            {$sort: {createdAt: -1}},
            {$limit: limit},
            {
                $lookup: {
                    from: 'users',
                    localField: 'chatUsers',
                    foreignField: '_id',
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                nickname: 1,
                                gender: 1,
                                profilePhoto: 1,
                                // blockedUsers: 1
                            }
                        }
                    ],
                    as: 'chatUsers'
                }
            },
            {
                $project: {
                    _id: 1,
                    chatUsers: 1,
                    roomType: 1,
                    capacity: 1,
                    status: 1,
                    matchedGender: 1,
                    ageGroup: 1,
                    genderSelections: 1,
                    createdAt: 1,
                    isActive: 1
                }
            }
        ]);

        const queryTime = Date.now() - startTime;
        console.log(`⏱️ [getAllChatRooms] DB 쿼리 완료: ${queryTime}ms, ${rooms.length}개 방 조회`);

        // 4. ObjectId → String 변환 (프론트엔드 호환성)
        const processedRooms = rooms.map(room => ({
            ...room,
            _id: room._id.toString(),
            chatUsers: room.chatUsers.map(user => ({
                ...user,
                _id: user._id.toString(),
                // blockedUsers: (user.blockedUsers || []).map(id => id.toString())
            })),
            genderSelections: room.genderSelections
                ? Object.fromEntries(
                    Object.entries(room.genderSelections).map(([key, value]) => [
                        key.toString(),
                        value
                    ])
                )
                : {}
        }));

        // ✅ 추가: 다음 페이지 존재 여부 확인
        const hasMore = rooms.length === limit;
        const nextLastId = rooms.length > 0
            ? rooms[rooms.length - 1]._id.toString()
            : null;

        console.log(`✅ [getAllChatRooms] 처리 완료: ${processedRooms.length}개 방, hasMore: ${hasMore}`);

        if (queryTime > 100) {
            console.warn(`⚠️ [getAllChatRooms] 느린 쿼리 감지: ${queryTime}ms`);
        }

        // ✅ 수정: 응답에 페이징 정보 추가
        const result = {
            rooms: processedRooms,
            pagination: {
                hasMore: hasMore,
                nextLastId: nextLastId,
                limit: limit
            }
        };

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🆕 2. 쿼리 결과 캐싱 (특정 사용자 첫 페이지만)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (filters.chatUsers && !filters.lastId) {
            const cacheKey = `active_rooms:${filters.chatUsers}`;
            await IntelligentCache.setCache(cacheKey, result, 300); // 5분 TTL
            console.log(`💾 [캐싱] 활성방: ${filters.chatUsers} (TTL: 5분)`);
        }
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        return result;

    } catch (error) {
        console.error('❌ [getAllChatRooms] 오류 발생:', error);
        console.error('오류 스택:', error.stack);
        throw new Error(`채팅방 목록 조회 실패: ${error.message}`);
    }
};

/**
 * 🔍 참가 가능한 방 찾기 (차단 관계 + 나이 검증)
 * @returns {Object} { success, room, user, attemptedRooms, reason }
 */

export const findAvailableRoom = async (
    userId,
    roomType,
    capacity,
    matchedGender,
    ageGroup
) => {
    try {
        console.log('🔍 [방찾기-최적화] 시작');

        // 1️⃣ 데이터 병렬 조회 (동일)
        const [user, blockedMeCacheResult, exitedRooms] = await Promise.all([
            User.findById(userId).select('blockedUsers birthdate gender').lean(),
            IntelligentCache.getCache(`users_blocked_me_${userId}`),
            ChatRoomExit.distinct('chatRoom', {user: userId})
        ]);

        if (!user) throw new Error('사용자를 찾을 수 없습니다.');

        // 2️⃣ 차단 관계 (동일)
        let blockedMeIds = blockedMeCacheResult || [];
        if (!blockedMeCacheResult) {
            const blockedMeUsers = await User.find({blockedUsers: userId}).select('_id').lean();
            blockedMeIds = blockedMeUsers.map(u => u._id.toString());
            await IntelligentCache.setCache(`users_blocked_me_${userId}`, blockedMeIds, 3600);
        }

        const myBlockedIds = user.blockedUsers?.map(id => id.toString()) || [];
        const allBlockedIds = [...new Set([...myBlockedIds, ...blockedMeIds])];

        // 3️⃣ 나이 검증 (동일)
        if (roomType === 'random' && ageGroup) {
            if (!user.birthdate) {
                const err = new Error('생년월일 정보가 필요합니다.');
                err.status = 403;
                throw err;
            }

            const ageInfo = await getAgeInfoUnified(userId, user.birthdate);
            if (!ageInfo || ageInfo.ageGroup !== ageGroup) {
                const err = new Error('나이 조건이 맞지 않습니다.');
                err.status = 403;
                throw err;
            }
        }

        // 4️⃣ MongoDB Aggregation (단순화)
        const userObjectId = new mongoose.Types.ObjectId(userId);
        const exitedObjectIds = exitedRooms.map(id => new mongoose.Types.ObjectId(id));
        const blockedObjectIds = allBlockedIds.map(id => new mongoose.Types.ObjectId(id));

        const pipeline = [
            // Step A: 기본 필터링
            {
                $match: {
                    roomType: roomType,
                    capacity: capacity,
                    ageGroup: ageGroup,
                    isActive: false,
                    status: 'waiting',
                    _id: {$nin: exitedObjectIds},
                    chatUsers: {$nin: [userObjectId]},

                    // ✅ 빈 방 제외: 최소 1명 이상 + 정원 미만
                    $expr: {
                        $and: [
                            {$gt: [{$size: '$chatUsers'}, 0]},        // 최소 1명 이상
                            {$lt: [{$size: '$chatUsers'}, '$capacity']}  // 정원 미만
                        ]
                    }
                }
            },

            // Step B: 성별 (방의 설정)
            ...(matchedGender !== 'any' ? [{
                $match: {matchedGender: {$in: [matchedGender, 'any']}}
            }] : []),

            // Step C: 차단된 사람이 있는 방 제외
            ...(blockedObjectIds.length > 0 ? [{
                $match: {
                    $expr: {
                        $eq: [
                            {$size: {$setIntersection: ['$chatUsers', blockedObjectIds]}},
                            0
                        ]
                    }
                }
            }] : []),

            // Step D: 참가자 정보 조회
            {
                $lookup: {
                    from: 'users',
                    localField: 'chatUsers',
                    foreignField: '_id',
                    pipeline: [{$project: {_id: 1, blockedUsers: 1, gender: 1}}],
                    as: 'participantsData'
                }
            },

            // Step E: 상대가 나를 차단했는지 확인
            {
                $match: {
                    $expr: {
                        $not: {
                            $anyElementTrue: {
                                $map: {
                                    input: '$participantsData',
                                    as: 'p',
                                    in: {$in: [userObjectId, '$$p.blockedUsers']}
                                }
                            }
                        }
                    }
                }
            },

            // Step F: 정렬 및 후보 가져오기
            {$sort: {createdAt: 1}},
            {$limit: 5}  // ✅ 5개 후보 가져오기
        ];

        const candidates = await ChatRoom.aggregate(pipeline);

        // ✅ 입장자의 성별 (버그 수정: myGender 변수 정의 추가)
        const myGender = user.gender;
        console.log(`👤 [방찾기] 입장자 성별: ${myGender}, 선호: ${matchedGender}`);

        // 5️⃣ JavaScript로 성별 검증 (간단하고 명확)
        for (const room of candidates) {
            // 성별 매칭 체크
            let isValid = true;

            if (matchedGender !== 'any') {
                for (const participant of room.participantsData) {
                    // 상대가 설정한 성별 선호도 확인
                    const participantIdStr = participant._id.toString();
                    // const genderSelection = room.genderSelections?.get(participant._id.toString());
                    const genderSelection = room.genderSelections?.[participantIdStr];

                    if (genderSelection) {
                        const pref = genderSelection.preference;
                        const pGender = participant.gender;

                        console.log(`🔍 [방찾기] 방 ${room._id} - 상대 성별: ${pGender}, 상대 선호: ${pref}, 내 성별: ${myGender}`);

                        // 상대가 '이성만' 원하는데 내가 동성
                        if (pref === 'opposite' && myGender === pGender) {
                            console.log(`⚠️ [방찾기] 성별 불일치: 상대가 이성만 원하는데 동성`);
                            isValid = false;
                            break;
                        }

                        // 상대가 '동성만' 원하는데 내가 이성
                        if (pref === 'same' && myGender !== pGender) {
                            console.log(`⚠️ [방찾기] 성별 불일치: 상대가 동성만 원하는데 이성`);
                            isValid = false;
                            break;
                        }
                    }
                }
            }

            if (isValid) {
                // ✅ 첫 번째 유효한 방 반환
                room._id = room._id.toString();
                room.chatUsers = room.chatUsers.map(id => id.toString());

                console.log(`✅ [방찾기] 매칭 성공: ${room._id}`);
                return {
                    success: true,
                    room: room,
                    user: user,
                    attemptedRooms: candidates.indexOf(room) + 1
                };
            }
        }

        // 6️⃣ 매칭 실패
        console.log('❌ [방찾기] 조건에 맞는 방 없음');
        return {
            success: false,
            room: null,
            user: user,
            attemptedRooms: candidates.length,
            reason: 'NO_AVAILABLE_ROOM'
        };

    } catch (error) {
        console.error('❌ [방찾기] 오류:', error);
        throw error;
    }
};


/**
 * 채팅방에 사용자 추가
 * @param {string} roomId - 채팅방 ID
 * @param {string} userId - 사용자 ID
 * @param {string} selectedGender - 선택한 성별 카테고리 (opposite/any/same)
 */
export const addUserToRoom = async (roomId, userId, selectedGender = null, cachedUser = null) => {
    try {

        // 1) 방  현재 참가자들의 blockedUsers 정보 조회
        const room = await ChatRoom.findById(roomId)
            .populate('chatUsers', 'blockedUsers gender')   // ← 추가
            .exec();
        if (!room) {
            throw new Error('채팅방을 찾을 수 없습니다.');
        }

        /* 🔒 이미 퇴장한 적이 있으면 재입장 금지 */
        const hasExited = await ChatRoomExit.exists({                    // [3]
            chatRoom: roomId, user: userId
        });
        if (hasExited) {
            const err = new Error('이미 퇴장한 채팅방입니다.');
            err.status = 403;
            throw err;                                                     // controller에서 그대로 전송
        }

        // 2) 입장하려는 사용자 본인의 blockedUsers 가져오기
        const joiner = cachedUser || await User.findById(userId)
            .select('blockedUsers birthdate gender');
        if (!joiner) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }


        // 3) 차단 관계 양방향 검사
        const blockedByMe = room.chatUsers.some(u =>
            joiner.blockedUsers.includes(u._id)
        );
        const blockedMe = room.chatUsers.some(u =>
            u.blockedUsers.includes(userId)
        );

        if (blockedByMe || blockedMe) {
            const err = new Error('차단 관계가 있는 사용자와 함께할 수 없습니다.');
            err.status = 403;          // 컨트롤러에서 그대로 사용
            throw err;
        }

        // 성별 매칭 검증
        if (room.roomType === 'random' && room.matchedGender !== 'any') {
            const joinerGender = joiner.gender;

            // 성별 정보 확인
            if (!joinerGender || joinerGender === 'select') {
                const err = new Error('성별 정보가 필요합니다.');
                err.status = 403;
                throw err;
            }

            // 각 참가자와 성별 매칭 확인
            for (const participant of room.chatUsers) {
                const participantGender = participant.gender;

                if (room.matchedGender === 'opposite') {
                    // 이성만 허용
                    if (participantGender === joinerGender) {
                        const err = new Error('이 방은 이성만 참가할 수 있습니다.');
                        err.status = 403;
                        throw err;
                    }
                } else if (room.matchedGender === 'same') {
                    // 동성만 허용
                    if (participantGender !== joinerGender) {
                        const err = new Error('이 방은 동성만 참가할 수 있습니다.');
                        err.status = 403;
                        throw err;
                    }
                }
            }
        }


        // 4) 기존 로직 유지 ― 실제로 방에 추가
        if (!room.chatUsers.includes(userId)) {
            room.chatUsers.push(userId);

            // 🔧 랜덤채팅에서 성별 선택 정보 저장
            if (room.roomType === 'random') {
                const userGender = joiner.gender;  // 본인 성별
                const userPreference = selectedGender || room.matchedGender;  // 선택한 매칭 조건

                // 검증: 본인 성별
                if (!userGender || !['male', 'female'].includes(userGender)) {
                    const err = new Error('성별 정보가 필요합니다. 마이페이지에서 설정해주세요.');
                    err.status = 403;
                    throw err;
                }

                // 검증: 매칭 선택
                if (!userPreference || !['opposite', 'same', 'any'].includes(userPreference)) {
                    const err = new Error('매칭 조건이 올바르지 않습니다.');
                    err.status = 400;
                    throw err;
                }

                // 객체 형태로 저장
                room.genderSelections.set(userId.toString(), {
                    gender: userGender,
                    preference: userPreference
                });

                console.log(`✅ 성별 정보 저장: ${userId} → gender: ${userGender}, preference: ${userPreference}`);
            }

            if (room.roomType === 'random' && room.chatUsers.length >= room.capacity) {
                room.isActive = true;
                room.status = 'active';
                return await room.save();
            }
        }
        await room.save();
        // ✅ 친구방인 경우 캐시 무효화
        if (room.roomType === 'friend' && room.chatUsers.length === 2) {
            const [user1, user2] = room.chatUsers.map(id => id.toString());
            await IntelligentCache.invalidateFriendRoomCache(user1, user2);
            await IntelligentCache.deleteCache(`friend_room:${user1}:${user2}`);
            console.log(`🗑️ [캐시 무효화] 친구방 활성화: ${user1} ↔ ${user2}`);
        }
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ 채팅방 캐시 무효화 (타이밍 문제 해결 - joinRoom에서 최신 데이터 조회 가능)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        await IntelligentCache.deleteCache(CacheKeys.CHAT_ROOM(roomId));
        console.log(`🗑️ [캐시 무효화] 채팅방: ${roomId}`);
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🆕 활성방 캐시 무효화 (추가)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        await IntelligentCache.deleteCache(`active_rooms:${userId}`);
        console.log(`🗑️ [캐시 무효화] 활성방 입장: ${userId}`);
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


        return room;
    } catch (error) {
        throw error;
    }
};

// ============================================================================
//   🔐 메시지 저장 시스템 (통합 및 최적화 완료)
//   - 암호화/평문 자동 선택
//   - sender 타입 오류 해결됨
//   - 환경변수 기반 동적 전환
// ============================================================================

/**
 * 🔄 통합 메시지 저장 함수 (암호화 설정에 따라 자동 선택)
 * @param {string} chatRoom - 채팅방 ID
 * @param {string} senderId - 발송자 ID
 * @param {string} text - 메시지 텍스트
 * @param {Object} metadata - 메타데이터 (선택적)
 * @returns {Object} 저장된 메시지 객체
 */
export const saveMessage = async (chatRoom, senderId, text, metadata = {}) => {
    try {
        // 1. senderId 유효성 검증
        if (!senderId) {
            throw new Error('senderId는 필수입니다.');
        }

        // 2. 환경변수로 암호화 여부 결정
        const encryptionEnabled = process.env.CHAT_ENCRYPTION_ENABLED === 'true';

        const messageData = {
            roomId: chatRoom,
            senderId: senderId,
            text: text, // 원본 텍스트 사용 (필터링 제거)
            metadata: metadata
        };

        if (encryptionEnabled) {
            console.log('🔐 [메시지저장] 암호화 모드로 저장 (원본)');
            return await saveEncryptedMessage(messageData);
        } else {
            console.log('📝 [메시지저장] 평문 모드로 저장 (원본)');
            // 기존 방식 유지 (하위 호환성)
            const newMessage = new ChatMessage({
                chatRoom,
                sender: senderId,
                text: text, // 원본 텍스트 사용 (필터링 제거)
                isEncrypted: false, // 명시적으로 평문임을 표시
            });
            return await newMessage.save();
        }

    } catch (error) {
        console.error('❌ [메시지저장] 통합 저장 실패:', error);
        throw error;
    }
};

/**
 * 🔐 암호화된 메시지 저장
 * @param {Object} messageData - 메시지 데이터
 * @param {string} messageData.roomId - 채팅방 ID
 * @param {string} messageData.senderId - 발송자 ID
 * @param {string} messageData.text - 메시지 텍스트
 * @param {Object} messageData.metadata - 메타데이터 (선택적)
 * @returns {Object} 저장된 메시지 객체
 */
export const saveEncryptedMessage = async (messageData) => {
    try {
        const {roomId, senderId, text, metadata = {}} = messageData;

        console.log(`🔐 [메시지저장] 암호화 저장 시작: "${text.substring(0, 20)}..."`);

        // 3. 메시지 암호화
        const encryptedData = ChatEncryption.encryptMessage(text);

        // 4. 메시지 저장
        const message = new ChatMessage({
            chatRoom: roomId,
            sender: senderId, // ObjectId만 저장 (버그 수정됨)

            // text 필드는 생략 (isEncrypted: true이므로 required: false)

            // 암호화 필드들
            isEncrypted: true,
            encryptedText: encryptedData.encryptedText,
            iv: encryptedData.iv,
            tag: encryptedData.tag,

            // 메타데이터
            metadata: {
                platform: metadata.platform || 'web',
                userAgent: metadata.userAgent || 'unknown',
                ipHash: metadata.ipHash || null
            }
        });

        const savedMessage = await message.save();

        console.log(`✅ [메시지저장] 암호화 저장 완료: ${savedMessage._id}`);

        return savedMessage;

    } catch (error) {
        console.error('❌ [메시지저장] 암호화 저장 실패:', error);
        throw new Error('암호화된 메시지 저장에 실패했습니다: ' + error.message);
    }
};

/**
 * 메시지 읽음 처리 (Last-Read Pointer 방식)
 * RoomEntry.lastReadAt을 현재 시간으로 갱신 — 1개 문서만 update
 */
export const markMessagesAsRead = async (roomId, userId) => {
    try {
        const result = await RoomEntry.findOneAndUpdate(
            { room: roomId, user: userId },
            { $set: { lastReadAt: new Date() } },
            { upsert: true, new: true }
        );
        return result;
    } catch (error) {
        throw new Error(`메시지 읽음 처리 실패: ${error.message}`);
    }
};

/**
 * 상대방의 마지막 읽은 시간 조회 (인스타 "읽음" 표시용)
 * 1:1 친구 채팅 전용
 */
export const getPartnerLastReadAt = async (roomId, userId) => {
    try {
        const room = await ChatRoom.findById(roomId).select('chatUsers').lean();
        if (!room) return null;

        const partnerId = room.chatUsers.find(u => u.toString() !== userId.toString());
        if (!partnerId) return null;

        const pointer = await RoomEntry.findOne({ room: roomId, user: partnerId }).lean();
        return pointer?.lastReadAt || null;
    } catch (error) {
        return null;
    }
};

/**
 * 채팅방의 안읽은 메시지 개수 조회 (Last-Read Pointer 방식)
 */
export const getUnreadMessageCount = async (roomId, userId) => {
    try {
        const pointer = await RoomEntry.findOne({ room: roomId, user: userId }).lean();
        const lastReadAt = pointer?.lastReadAt || new Date(0);

        const count = await ChatMessage.countDocuments({
            chatRoom: roomId,
            sender: { $ne: userId },
            createdAt: { $gt: lastReadAt }
        });

        return count;
    } catch (error) {
        throw new Error(`안읽은 메시지 개수 조회 실패: ${error.message}`);
    }
};


/**
 * 여러 채팅방의 안읽은 메시지 개수 일괄 조회 (Last-Read Pointer 방식)
 * @param {string[]} roomIds - 채팅방 ID 배열 (최대 100개)
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Object>} { roomId: unreadCount } 형태의 객체
 */
export const getUnreadCountsBatch = async (roomIds, userId) => {
    try {
        if (!Array.isArray(roomIds) || roomIds.length === 0) {
            return {};
        }

        if (roomIds.length > 100) {
            throw new Error('최대 100개 채팅방까지 조회 가능합니다.');
        }

        // 1. 사용자의 모든 읽음 포인터 조회 (작은 컬렉션, 빠름)
        const pointers = await RoomEntry.find({
            user: new mongoose.Types.ObjectId(userId),
            room: { $in: roomIds.map(id => new mongoose.Types.ObjectId(id)) }
        }).lean();

        const pointerMap = {};
        pointers.forEach(p => {
            pointerMap[p.room.toString()] = p.lastReadAt;
        });

        // 2. 방별 조건으로 안읽은 메시지 aggregation
        const conditions = roomIds.map(roomId => ({
            chatRoom: new mongoose.Types.ObjectId(roomId),
            sender: { $ne: new mongoose.Types.ObjectId(userId) },
            createdAt: { $gt: pointerMap[roomId] || new Date(0) }
        }));

        const results = await ChatMessage.aggregate([
            { $match: { $or: conditions } },
            { $group: { _id: '$chatRoom', unreadCount: { $sum: 1 } } },
            { $project: { _id: 0, roomId: { $toString: '$_id' }, unreadCount: 1 } }
        ]);

        // 3. 결과 매핑 (없는 방은 0)
        const countMap = {};
        results.forEach(item => {
            countMap[item.roomId] = item.unreadCount;
        });
        roomIds.forEach(roomId => {
            if (!(roomId in countMap)) countMap[roomId] = 0;
        });

        return countMap;

    } catch (error) {
        throw new Error(`안읽은 개수 배치 조회 실패: ${error.message}`);
    }
};


/**
 * 채팅방 입장 시간 기록 (markMessagesAsRead의 별칭)
 * findOrCreateFriendRoom 등 기존 호출부 호환용
 */
export const recordRoomEntry = async (roomId, userId) => {
    return markMessagesAsRead(roomId, userId);
};

/**
 * 🔄 통합 메시지 저장 함수 (암호화 설정에 따라 자동 선택)
 * @param {string} chatRoom - 채팅방 ID
 * @param {string} senderId - 발송자 ID
 * @param {string} text - 메시지 텍스트
 * @param {Object} metadata - 메타데이터 (선택적)
 * @returns {Object} 저장된 메시지 객체
 */


/**
 * 🔐 암호화된 메시지 저장
 * @param {Object} messageData - 메시지 데이터
 * @param {string} messageData.roomId - 채팅방 ID
 * @param {string} messageData.senderId - 발송자 ID
 * @param {string} messageData.text - 메시지 텍스트
 * @param {Object} messageData.metadata - 메타데이터 (선택적)
 * @returns {Object} 저장된 메시지 객체
 */


/**
 * 특정 채팅방의 메시지 가져오기 (사용자용 - 자동 복호화)
 * @param {string} roomId - 채팅방 ID
 * @param {boolean} includeDeleted - true면 isDeleted 플래그에 관계없이 모두 조회
 * @param {number} page - 페이지 번호
 * @param {number} limit - 페이지당 메시지 수
 * @param {string} requestUserId - 요청한 사용자 ID (권한 확인용)
 * @returns {Object} 복호화된 메시지 목록
 */
export const getMessagesByRoom = async (roomId, includeDeleted = false, page = 1, limit = 20, requestUserId = null) => {
    const filter = includeDeleted
        ? {chatRoom: roomId}
        : {chatRoom: roomId, isDeleted: false};

    const room = await ChatRoom.findById(roomId)
        .select('roomType chatUsers')
        .lean();

    // 권한 확인: 요청한 사용자가 해당 채팅방에 속해있는지 확인
    if (requestUserId && room && !room.chatUsers.some(
        userId => userId.toString() === requestUserId.toString()
    )) {
        throw new Error('해당 채팅방에 접근할 권한이 없습니다.');
    }

    // ✅ 요청자의 욕설 필터 설정 확인
    let shouldFilter = false; // 기본값: 필터링 안함
    if (requestUserId) {
        const requestUser = await User.findById(requestUserId)
            .select('wordFilterEnabled');
        shouldFilter = requestUser?.wordFilterEnabled === true;
        console.log(`🔍 [메시지조회] 사용자: ${requestUserId}, 필터링: ${shouldFilter ? 'ON' : 'OFF'}`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🆕 1. 히스토리 방 캐싱 체크 (추가된 부분)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (includeDeleted) {  // includeDeleted = true → 히스토리 방
        // 캐시 키 생성 (사용자별, 필터 설정별로 캐싱)
        const cacheKey = `messages:history:${roomId}:${requestUserId}:${shouldFilter}`;
        const cached = await IntelligentCache.getCache(cacheKey);

        if (cached) {
            console.log(`💾 [캐시 HIT] 히스토리 메시지: ${roomId}`);
            return cached;
        }

        console.log(`🔍 [캐시 MISS] 히스토리 메시지 DB 조회: ${roomId}`);
    }
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    let messages;
    let pagination;

    // 친구 채팅에만 시간 제한 및 페이지네이션 적용
    if (room && room.roomType === 'friend') {
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
        filter.createdAt = {$gte: twoDaysAgo};

        const totalMessages = await ChatMessage.countDocuments(filter);
        const totalPages = Math.ceil(totalMessages / limit);
        const skip = (page - 1) * limit;

        messages = await ChatMessage.find(filter)
            .populate('sender', '_id nickname profilePhoto')
            .select('_id text sender isDeleted createdAt encryptedText iv tag isEncrypted isSystem')
            .lean()  // ✅ 추가 (성능 최적화)
            .sort({createdAt: -1})
            .skip(skip)
            .limit(limit)


        pagination = {
            currentPage: page,
            totalPages,
            totalMessages,
            hasNextPage: page < totalPages
        };

        messages = messages.reverse();
    } else {
        // 그 외 채팅방(랜덤 채팅 등)은 모든 메시지를 한 번에 반환
        messages = await ChatMessage.find(filter)
            .populate('sender', '_id nickname profilePhoto')
            .select('_id text sender isDeleted createdAt encryptedText iv tag isEncrypted isSystem')
            .lean()  // ✅ 추가 (성능 최적화)
            .sort({createdAt: 1})

        pagination = {
            currentPage: 1,
            totalPages: 1,
            totalMessages: messages.length,
            hasNextPage: false
        };
    }

    // 🔓 메시지 복호화 처리 (사용자용)
    const decryptedMessages = await Promise.all(
        messages.map(async (message) => {
            const messageObj = {...message};  // ✅ 스프레드 연산자로 복사

            try {
                // 암호화된 메시지인 경우 복호화
                if (messageObj.isEncrypted && messageObj.encryptedText) {
                    const encryptedData = {
                        encryptedText: messageObj.encryptedText,
                        iv: messageObj.iv,
                        tag: messageObj.tag
                    };

                    // ChatEncryption을 사용해 복호화
                    const decryptedText = ChatEncryption.decryptMessage(encryptedData);

                    // 암호화 관련 필드는 클라이언트에 노출하지 않음
                    delete messageObj.encryptedText;
                    delete messageObj.iv;
                    delete messageObj.tag;


                    // ✅ 복호화된 텍스트를 text 필드에 설정 (사용자 설정에 따라 필터링)
                    messageObj.text = shouldFilter ? filterProfanity(decryptedText) : decryptedText;
                    messageObj.isEncrypted = false; // 클라이언트에는 복호화된 상태로 전달

                    // 성능 최적화: 메시지 복호화 로그는 디버그 모드에서만 출력
                    if (process.env.NODE_ENV === 'development' && process.env.LOG_LEVEL === 'debug') {
                        console.log(`🔓 [메시지조회] 복호화 완료: ${messageObj._id} -> "${decryptedText.substring(0, 20)}..."`);
                    }
                } else {
                    // ✅ 평문 메시지 (사용자 설정에 따라 필터링)
                    const originalText = messageObj.text || '';
                    messageObj.text = shouldFilter ? filterProfanity(originalText) : originalText;
                    if (process.env.NODE_ENV === 'development' && process.env.LOG_LEVEL === 'debug') {
                        console.log(`📝 [메시지조회] 평문 메시지: ${messageObj._id} -> "${(messageObj.text || '').substring(0, 20)}..."`);
                    }
                }

                return messageObj;

            } catch (decryptError) {
                console.error(`❌ [메시지조회] 복호화 실패: ${messageObj._id}`, decryptError);

                // 복호화 실패 시 오류 메시지로 대체
                messageObj.text = '[메시지를 불러올 수 없습니다]';
                messageObj.isEncrypted = false;
                messageObj.isError = true;

                // 암호화 관련 필드 제거
                delete messageObj.encryptedText;
                delete messageObj.iv;
                delete messageObj.tag;


                return messageObj;
            }
        })
    );

    // API 응답 형식을 통일하여 반환
    const result = {
        messages: decryptedMessages,
        pagination: pagination
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🆕 2. 히스토리 방 결과 캐싱 (추가된 부분)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (includeDeleted) {
        const cacheKey = `messages:history:${roomId}:${requestUserId}:${shouldFilter}`;
        await IntelligentCache.setCache(cacheKey, result, 3600); // 1시간 TTL
        console.log(`💾 [캐싱] 히스토리 메시지: ${roomId} (TTL: 1시간)`);
    }
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    return result;
};

/**
 * 채팅 메시지 삭제
 */
export const softDeleteMessage = async (messageId) => {
    // 1. ObjectId 유효성 검증
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
        const error = new Error('잘못된 메시지 ID 형식입니다.');
        error.status = 400;
        throw error;
    }


    const result = await ChatMessage.updateOne(
        {_id: messageId},
        {$set: {isDeleted: true}}
    );

    // 3. 결과 검증
    if (result.matchedCount === 0) {
        const error = new Error('메시지를 찾을 수 없습니다.');
        error.status = 404;
        throw error;
    }
};


/**
 * 채팅방에서 사용자 제거
 */
export const leaveChatRoomService = async (roomId, userId) => {
    try {
        // ✅ 캐시 무효화 (가장 먼저 실행)
        const exitedCacheKey = `user_exited_rooms_${userId}`;
        await Promise.all([
            IntelligentCache.deleteCache(exitedCacheKey),
            IntelligentCache.deleteCache(CacheKeys.CHAT_ROOM(roomId)),
            IntelligentCache.deleteCache(`active_rooms:${userId}`)
        ]);
        console.log(`🗑️ [leaveChatRoom] 캐시 무효화: ${exitedCacheKey}`);
        console.log(`🗑️ [leaveChatRoom] 채팅방 캐시 무효화: ${roomId}`);
        console.log(`🗑️ [leaveChatRoom] 활성방 캐시 무효화: ${userId}`);

        // ✅ 2. 병렬 DB 조회 (2개 동시 실행)
        const [chatRoom, existingExit] = await Promise.all([
            ChatRoom.findById(roomId)
                .select('chatUsers capacity status roomType matchedGender ageGroup genderSelections createdAt')
                .lean(),
            ChatRoomExit.findOne({chatRoom: roomId, user: userId})
        ]);

        if (!chatRoom) throw new Error('채팅방을 찾을 수 없습니다.');

        /* ② phase 결정 : waiting | active */
        const phase = chatRoom.status === 'waiting' ? 'waiting' : 'active';

        /* ③ Exit 레코드 upsert */
        if (!existingExit) {
            await  ChatRoomExit.create({chatRoom: roomId, user: userId, phase});
        } else if (existingExit.phase !== phase) {
            existingExit.phase = phase;          // waiting → active 로 승격
            await existingExit.save();
        }
        /* ④ 단계별 참가자 배열 처리 */
        let updatedChatUsers = chatRoom.chatUsers;

        if (phase === 'waiting') {
            // ✅ const 제거 - 외부 let 변수에 할당
            updatedChatUsers = chatRoom.chatUsers.filter(
                user => user.toString() !== userId.toString()
            );

            await ChatRoom.updateOne(
                { _id: roomId },
                { $set: { chatUsers: updatedChatUsers } }
            );
        }
        // active 단계는 배열 유지(매너 평가용)

        /* ⑤ 방 삭제 판단 */
        let shouldDelete = false;
        if (phase === 'waiting') {
            shouldDelete = updatedChatUsers.length === 0;
        } else {
            const activeExitCnt = await ChatRoomExit.countDocuments({
                chatRoom: roomId,
                phase: 'active'
            });
            shouldDelete = activeExitCnt >= chatRoom.capacity;
        }

        /* ⑥ 정리 & 삭제 */
        if (shouldDelete) {
            // ✅ genderSelections 변환 (Map → Object)
            let genderSelectionsObj = {};
            if (chatRoom.genderSelections) {
                // .lean() 사용 시 이미 Object이지만, Map인 경우도 처리
                if (chatRoom.genderSelections instanceof Map) {
                    genderSelectionsObj = Object.fromEntries(chatRoom.genderSelections);
                } else if (typeof chatRoom.genderSelections === 'object') {
                    genderSelectionsObj = chatRoom.genderSelections;
                }
            }

            console.log(`📋 [ChatRoomHistory] 저장 데이터:`, {
                chatRoomId: chatRoom._id,
                chatUsers: chatRoom.chatUsers,
                capacity: chatRoom.capacity,
                matchedGender: chatRoom.matchedGender,
                genderSelections: genderSelectionsObj
            });

            await ChatRoomHistory.create({
                chatRoomId: chatRoom._id,
                meta: {
                    chatUsers: chatRoom.chatUsers,
                    capacity: chatRoom.capacity,
                    roomType: chatRoom.roomType,
                    matchedGender: chatRoom.matchedGender,
                    ageGroup: chatRoom.ageGroup,
                    createdAt: chatRoom.createdAt,
                    genderSelections: genderSelectionsObj
                }
            });
            // ✅ 삭제는 병렬 처리 (히스토리 생성 후)
            await Promise.all([
                ChatRoom.deleteOne({_id: roomId}),
                ChatRoomExit.deleteMany({chatRoom: roomId})
            ]);
        }

        // return {success: true,
        //    // message: '채팅방에서 나갔습니다.'
        // };
    } catch (err) {
        console.error('[leaveChatRoomService] error:', err);
        throw err;
    }
};

/**
 * 랜덤채팅 히스토리 조회
 * @param {{ 'meta.chatUsers': string, page?: number, size?: number }} filters
 */
export const getChatRoomHistory = async (filters) => {
    const page = parseInt(filters.page) || 1;
    const size = parseInt(filters.size) || 100;
    const skip = (page - 1) * size;
    const userId = filters['meta.chatUsers'];

    // 🆕 캐시 키 (선택적)
    const cacheKey = `chat_history:${userId || 'all'}:${page}:${size}`;

    // 🆕 캐시 조회 (선택적)
    const cached = await IntelligentCache.getCache(cacheKey);
    if (cached) {
        console.log(`💾 [캐시 HIT] 히스토리: ${cacheKey}`);
        return cached;
    }

    console.log(`🔍 [캐시 MISS] 히스토리 DB 조회: ${cacheKey}`);

    // 🔧 필터 조건을 동적으로 구성
    const query = {};

    // meta.chatUsers 필터가 있을 때만 적용
    if (userId) {
        query['meta.chatUsers'] = userId;
    }

    console.log('📋 히스토리 쿼리 조건:', query);


    const histories = await ChatRoomHistory
        .find(query)
        .lean()
        .populate('meta.chatUsers', '_id nickname gender')
        .sort({timestamp: -1})

    console.log(`📦 조회된 히스토리 개수: ${histories.length}`);

    const processedHistories = histories.map(history => ({
        chatRoomId: history.chatRoomId,
        timestamp: history.timestamp,
        meta: {
            chatUsers: history.meta.chatUsers,              // ✅ 필수
            roomType: history.meta.roomType,                // ✅ 필수
            capacity: history.meta.capacity,                // ✅ 필수
            matchedGender: history.meta.matchedGender,      // ✅ 필수
            createdAt: history.meta.createdAt,              // ✅ 필수
            genderSelections: history.meta.genderSelections // ✅ 필수
            // ❌ ageGroup 제거 - 프론트에서 미사용
            // ❌ chatUsersWithGender 제거 - 중복 데이터
        }
    }));

    // 🆕 캐싱 (선택적, 24시간)
    await IntelligentCache.setCache(cacheKey, processedHistories, 86400);
    console.log(`✅ [캐싱] ${processedHistories.length}개 히스토리`);

    return processedHistories;
};


// /**
//  * 사용자 exit 기록을 기반으로 종료한 채팅방 ID 목록 조회
//  * @param {string} userId - 사용자 ID
//  * @returns {Promise<Array>} - 종료한 채팅방 ID 배열
//  */
// export const getUserLeftRooms = async (userId) => {
//     try {
//         const leftRooms = await ChatRoomExit.distinct('chatRoom', {user: userId});
//         return leftRooms;
//     } catch (error) {
//         throw new Error(error.message);
//     }
// };
// isActive 토글
export const setRoomActive = async (roomId, active) => {
    // ✅ 1. 입력 검증
    if (typeof active !== 'boolean') {
        const error = new Error('active는 boolean 타입이어야 합니다.');
        error.status = 400;
        throw error;
    }
    // ✅ 2. findByIdAndUpdate로 원자적 업데이트
    const room = await ChatRoom.findByIdAndUpdate(
        roomId,
        { isActive: active },
        {
            new: true,           // 업데이트된 문서 반환
            select: 'isActive',  // ✅ isActive만 선택
            lean: true           // ✅ Plain Object (성능 향상)
        }
    );
    if (!room) {
        const error = new Error('채팅방을 찾을 수 없습니다.');
        error.status = 404;
        throw error;
    }

    return room;    // { isActive: true } - 30 bytes만 반환
};

export const saveSystemMessage = async (roomId, text) => {
    const msg = new ChatMessage({chatRoom: roomId, sender: null, text, isSystem: true});
    return await msg.save();
};

// ============================================================================
//   🧪 채팅 암호화 관련 유틸리티 함수들 (완성됨)
// ============================================================================

/**
 * 🧪 채팅 암호화 시스템 테스트 (개발자용)
 */
export const testChatEncryption = async () => {
    try {
        console.log('🧪 [시스템테스트] 채팅 암호화 통합 테스트 시작...');

        // 1. ChatEncryption 성능 테스트
        const encryptionTest = ChatEncryption.performanceTest();

        if (!encryptionTest.success) {
            throw new Error('암호화 기본 테스트 실패');
        }

        // 2. 메시지 저장 테스트 (실제 DB 저장하지 않음)
        const testMessageData = {
            roomId: '507f1f77bcf86cd799439011', // 더미 ObjectId
            senderId: '507f1f77bcf86cd799439012', // 더미 ObjectId  
            text: '테스트 메시지입니다! Hello 123 암호화 테스트'
        };

        console.log('💾 [시스템테스트] 메시지 저장 로직 테스트...');

        // 암호화 필드 생성 테스트 (실제 저장하지 않음)
        const encryptedData = ChatEncryption.encryptMessage(testMessageData.text);

        console.log('✅ [시스템테스트] 결과:');
        console.log(`  🔐 암호화: ${encryptionTest.encryptTime}ms`);
        console.log(`  🔓 복호화: ${encryptionTest.decryptTime}ms`);
        console.log(`  📦 암호화 데이터 크기: ${encryptedData.encryptedText.length} chars`);

        return {
            success: true,
            encryptionTest,

            encryptedSize: encryptedData.encryptedText.length
        };

    } catch (error) {
        console.error('❌ [시스템테스트] 실패:', error);
        return {success: false, error: error.message};
    }
};

/**
 * 관리자용 메시지 조회 (암호화 상태 그대로)
 * @param {string} roomId - 채팅방 ID
 * @param {boolean} includeDeleted - 삭제된 메시지 포함 여부
 * @param {number} page - 페이지 번호
 * @param {number} limit - 페이지당 메시지 수
 * @returns {Object} 암호화 상태 그대로의 메시지 목록 (관리자용)
 */
export const getMessagesByRoomForAdmin = async (roomId, includeDeleted = false, page = 1, limit = 20) => {
    const filter = includeDeleted
        ? {chatRoom: roomId}
        : {chatRoom: roomId, isDeleted: false};

    const room = await ChatRoom.findById(roomId).select('roomType').lean();

    // 친구 채팅에만 시간 제한 및 페이지네이션 적용
    if (room && room.roomType === 'friend') {
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
        filter.createdAt = {$gte: twoDaysAgo};

        const totalMessages = await ChatMessage.countDocuments(filter);
        const totalPages = Math.ceil(totalMessages / limit);
        const skip = (page - 1) * limit;

        const messages = await ChatMessage.find(filter)
            .populate('sender')
            .sort({createdAt: -1})
            .skip(skip)
            .limit(limit)
            .exec();

        return {
            messages: messages.reverse(),
            pagination: {
                currentPage: page,
                totalPages,
                totalMessages,
                hasNextPage: page < totalPages
            }
        };
    }

    // 그 외 채팅방(랜덤 채팅 등)은 모든 메시지를 한 번에 반환 (기존 방식)
    const messages = await ChatMessage.find(filter)
        .populate('sender')
        .sort({createdAt: 1})
        .exec();

    // 관리자용: 암호화 상태 그대로 반환 (복호화하지 않음)
    console.log(`🔧 [관리자조회] 암호화 상태로 ${messages.length}개 메시지 반환`);

    return {
        messages: messages,
        pagination: {
            currentPage: 1,
            totalPages: 1,
            totalMessages: messages.length,
            hasNextPage: false
        }
    };
};

// ============================================================================
//   🚨 신고된 메시지 백업 시스템 (법적 대응용)
// ============================================================================

/**
 * 신고된 메시지 백업 생성 (법적 대응용)
 * @param {string} messageId - 신고된 메시지 ID
 * @param {object} reportData - 신고 정보 { reportedBy, reason, reportId }
 * @returns {object} 백업 생성 결과
 */
export const createReportedMessageBackup = async (messageId, reportData) => {
    try {
        console.log(`🔒 [백업생성] 시작: ${messageId}`);
        console.log(`🔒 [백업생성] reportData:`, reportData);

        // 1. 원본 메시지 조회
        const originalMessage = await ChatMessage.findById(messageId)
            .populate('sender', 'nickname')
            .lean();

        if (!originalMessage) {
            console.error(`❌ [백업생성] 메시지 없음: ${messageId}`);
            throw new Error('원본 메시지를 찾을 수 없습니다');
        }

        console.log(`📄 [백업생성] 메시지 정보:`, {
            _id: originalMessage._id,
            isEncrypted: originalMessage.isEncrypted,
            hasText: !!originalMessage.text,
            hasEncryptedText: !!originalMessage.encryptedText
        });

        // 2. 이미 백업이 존재하는지 확인 (신고된 메시지 타입으로)
        let backup = await ReportedMessageBackup.findOne({
            originalMessageId: messageId,
            messageType: 'reported'
        });

        console.log(`🔍 [백업생성] 기존 백업 존재:`, !!backup);

        const retentionDate = new Date();
        retentionDate.setFullYear(retentionDate.getFullYear() + 3); // 3년 후

        let isFirstReport = false;

        if (backup) {
            // 3. 기존 백업이 있으면 신고자만 추가
            console.log(`♻️ [백업생성] 기존 백업 업데이트`);

            const reporterId = reportData.reportedBy.toString();
            const existingReporters = backup.reportedBy.map(id => id.toString());

            if (!existingReporters.includes(reporterId)) {
                backup.reportedBy.push(reportData.reportedBy);
                await backup.save();
                console.log('✅ [백업생성] 신고자 추가 완료');
            } else {
                console.log('ℹ️ [백업생성] 이미 신고한 사용자');
            }
        } else {
            // 4. 새 백업 생성 (암호화 상태 유지)
            console.log(`🆕 [백업생성] 새 백업 생성 (암호화 유지)`);
            isFirstReport = true;

            const backupData = {
                originalMessageId: messageId,
                roomId: originalMessage.chatRoom,
                sender: {
                    _id: originalMessage.sender._id,
                    nickname: originalMessage.sender.nickname
                },
                messageCreatedAt: originalMessage.createdAt,
                messageType: 'reported',
                reportedMessageId: messageId,  // 자기 자신
                contextOrder: 0,  // 신고된 메시지는 0
                reportedBy: [reportData.reportedBy],
                reportReason: reportData.reason || 'other',
                backupReason: 'legal_compliance',
                retentionUntil: retentionDate
            };

            // 암호화 여부에 따라 필드 설정
            if (originalMessage.isEncrypted && originalMessage.encryptedText) {
                backupData.isEncrypted = true;
                backupData.encryptedText = originalMessage.encryptedText;
                backupData.iv = originalMessage.iv;
                backupData.tag = originalMessage.tag;
                console.log('🔐 [백업생성] 암호화된 메시지 그대로 저장');
            } else {
                backupData.isEncrypted = false;
                backupData.text = originalMessage.text || '[메시지 내용 없음]';
                console.log('📝 [백업생성] 평문 메시지 저장');
            }

            backup = new ReportedMessageBackup(backupData);
            const saved = await backup.save();
            console.log('✅ [백업생성] 저장 완료, _id:', saved._id);

            // 5. 원본 메시지의 expiresAt을 3년으로 연장
            await ChatMessage.updateOne(
                { _id: messageId },
                { $set: { expiresAt: retentionDate } }
            );
            console.log('🕒 [백업생성] 원본 메시지 expiresAt 3년으로 연장');
        }

        // 6. 첫 번째 신고인 경우에만 컨텍스트 메시지 백업
        let contextResult = null;
        if (isFirstReport && reportData.reportId) {
            console.log('📦 [백업생성] 컨텍스트 메시지 백업 시작...');
            contextResult = await backupContextMessages(
                originalMessage.chatRoom,
                messageId,
                originalMessage.createdAt,
                reportData.reportId
            );
            console.log('📦 [백업생성] 컨텍스트 백업 결과:', contextResult);
        }

        // ✅ 저장 확인
        const verifyBackup = await ReportedMessageBackup.findOne({
            originalMessageId: messageId,
            messageType: 'reported'
        });

        console.log(`🔍 [백업생성] 저장 검증:`, {
            exists: !!verifyBackup,
            backupId: verifyBackup?._id,
            isEncrypted: verifyBackup?.isEncrypted,
            reportReason: verifyBackup?.reportReason
        });

        return {
            success: true,
            backupCreated: true,
            messageId: messageId,
            backupId: backup._id,
            isEncrypted: backup.isEncrypted,
            reportersCount: backup.reportedBy.length,
            reportReason: backup.reportReason,
            verified: !!verifyBackup,
            contextBackup: contextResult
        };

    } catch (error) {
        console.error('❌ [백업생성] 예외:', error);
        console.error('❌ [백업생성] 스택:', error.stack);

        return {
            success: false,
            error: error.message,
            messageId: messageId,
            stack: error.stack
        };
    }
};

/**
 * 컨텍스트 메시지 백업 (신고 기준 전후 메시지)
 *
 * 저장 범위:
 * - 이전: 1시간 내 메시지 OR 최소 50개
 * - 이후: 30분 내 메시지 OR 최소 50개
 * - 채팅방 전체 메시지 수를 초과할 수 없음
 *
 * @param {ObjectId} roomId - 채팅방 ID
 * @param {ObjectId} reportedMessageId - 신고된 메시지 ID
 * @param {Date} reportedAt - 신고된 메시지 시간
 * @param {ObjectId} reportId - 신고 ID
 * @returns {object} 백업 결과
 */
export const backupContextMessages = async (roomId, reportedMessageId, reportedAt, reportId) => {
    try {
        console.log(`📦 [컨텍스트백업] 시작: roomId=${roomId}, reportedMessageId=${reportedMessageId}`);

        const ONE_HOUR = 60 * 60 * 1000;
        const THIRTY_MINUTES = 30 * 60 * 1000;
        const MIN_MESSAGES = 50;

        // 3년 후 만료일 계산
        const retentionDate = new Date();
        retentionDate.setFullYear(retentionDate.getFullYear() + 3);

        // === 1. 이전 메시지 조회 (1시간 내 + 최소 50개 보장) ===
        const oneHourAgo = new Date(reportedAt.getTime() - ONE_HOUR);

        // 1시간 내 메시지 먼저 조회
        let beforeMessages = await ChatMessage.find({
            chatRoom: roomId,
            _id: { $ne: reportedMessageId },
            createdAt: { $gte: oneHourAgo, $lt: reportedAt }
        })
        .sort({ createdAt: -1 })
        .populate('sender', 'nickname')
        .lean();

        console.log(`📊 [컨텍스트백업] 1시간 내 이전 메시지: ${beforeMessages.length}개`);

        // 50개 미만이면 시간 범위 확장
        if (beforeMessages.length < MIN_MESSAGES) {
            const additionalCount = MIN_MESSAGES - beforeMessages.length;
            const additionalBefore = await ChatMessage.find({
                chatRoom: roomId,
                _id: { $ne: reportedMessageId },
                createdAt: { $lt: oneHourAgo }
            })
            .sort({ createdAt: -1 })
            .limit(additionalCount)
            .populate('sender', 'nickname')
            .lean();

            beforeMessages = [...beforeMessages, ...additionalBefore];
            console.log(`📊 [컨텍스트백업] 추가 조회 후 이전 메시지: ${beforeMessages.length}개`);
        }

        // === 2. 이후 메시지 조회 (30분 내 + 최소 50개 보장) ===
        const thirtyMinutesLater = new Date(reportedAt.getTime() + THIRTY_MINUTES);

        // 30분 내 메시지 먼저 조회
        let afterMessages = await ChatMessage.find({
            chatRoom: roomId,
            _id: { $ne: reportedMessageId },
            createdAt: { $gt: reportedAt, $lte: thirtyMinutesLater }
        })
        .sort({ createdAt: 1 })
        .populate('sender', 'nickname')
        .lean();

        console.log(`📊 [컨텍스트백업] 30분 내 이후 메시지: ${afterMessages.length}개`);

        // 50개 미만이면 시간 범위 확장
        if (afterMessages.length < MIN_MESSAGES) {
            const additionalCount = MIN_MESSAGES - afterMessages.length;
            const additionalAfter = await ChatMessage.find({
                chatRoom: roomId,
                _id: { $ne: reportedMessageId },
                createdAt: { $gt: thirtyMinutesLater }
            })
            .sort({ createdAt: 1 })
            .limit(additionalCount)
            .populate('sender', 'nickname')
            .lean();

            afterMessages = [...afterMessages, ...additionalAfter];
            console.log(`📊 [컨텍스트백업] 추가 조회 후 이후 메시지: ${afterMessages.length}개`);
        }

        console.log(`📊 [컨텍스트백업] 총계: 이전 ${beforeMessages.length}개 + 이후 ${afterMessages.length}개`);

        // === 3. 컨텍스트 메시지 백업 생성 ===
        const backupPromises = [];

        // 이전 메시지 백업 (가장 오래된 것부터 순서대로)
        const sortedBeforeMessages = beforeMessages.reverse(); // 시간순 정렬
        for (let i = 0; i < sortedBeforeMessages.length; i++) {
            const msg = sortedBeforeMessages[i];
            const contextOrder = -(sortedBeforeMessages.length - i); // -N ~ -1

            backupPromises.push(
                createSingleContextBackup(msg, {
                    messageType: 'context_before',
                    relatedReportId: reportId,
                    reportedMessageId: reportedMessageId,
                    contextOrder: contextOrder,
                    retentionUntil: retentionDate
                })
            );
        }

        // 이후 메시지 백업
        for (let i = 0; i < afterMessages.length; i++) {
            const msg = afterMessages[i];
            const contextOrder = i + 1; // +1 ~ +N

            backupPromises.push(
                createSingleContextBackup(msg, {
                    messageType: 'context_after',
                    relatedReportId: reportId,
                    reportedMessageId: reportedMessageId,
                    contextOrder: contextOrder,
                    retentionUntil: retentionDate
                })
            );
        }

        // === 4. 원본 ChatMessage의 expiresAt을 3년으로 연장 ===
        const allContextIds = [
            ...beforeMessages.map(m => m._id),
            ...afterMessages.map(m => m._id),
            reportedMessageId
        ];

        await ChatMessage.updateMany(
            { _id: { $in: allContextIds } },
            { $set: { expiresAt: retentionDate } }
        );

        console.log(`🕒 [컨텍스트백업] ${allContextIds.length}개 메시지 expiresAt 3년으로 연장`);

        // === 5. 백업 실행 ===
        const results = await Promise.allSettled(backupPromises);
        const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const failCount = results.filter(r => r.status === 'rejected' || !r.value).length;

        console.log(`✅ [컨텍스트백업] 완료: 성공 ${successCount}개, 실패 ${failCount}개`);

        return {
            success: true,
            beforeCount: beforeMessages.length,
            afterCount: afterMessages.length,
            totalBackups: successCount,
            failedBackups: failCount,
            expiresAtUpdated: allContextIds.length
        };

    } catch (error) {
        console.error('❌ [컨텍스트백업] 실패:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * 단일 컨텍스트 메시지 백업 생성 (암호화 상태 유지)
 */
const createSingleContextBackup = async (message, contextData) => {
    try {
        // 이미 백업된 메시지인지 확인 (동일 신고에 대해)
        const existing = await ReportedMessageBackup.findOne({
            originalMessageId: message._id,
            reportedMessageId: contextData.reportedMessageId
        });

        if (existing) {
            console.log(`⏭️ [단일백업] 이미 존재: ${message._id}`);
            return existing;
        }

        // 백업 데이터 구성 (암호화 상태 유지)
        const backupData = {
            originalMessageId: message._id,
            roomId: message.chatRoom,
            sender: {
                _id: message.sender?._id,
                nickname: message.sender?.nickname || '[알 수 없음]'
            },
            messageCreatedAt: message.createdAt,
            messageType: contextData.messageType,
            relatedReportId: contextData.relatedReportId,
            reportedMessageId: contextData.reportedMessageId,
            contextOrder: contextData.contextOrder,
            backupReason: 'context_preservation',
            retentionUntil: contextData.retentionUntil
        };

        // 암호화 여부에 따라 필드 설정
        if (message.isEncrypted && message.encryptedText) {
            backupData.isEncrypted = true;
            backupData.encryptedText = message.encryptedText;
            backupData.iv = message.iv;
            backupData.tag = message.tag;
        } else {
            backupData.isEncrypted = false;
            backupData.text = message.text || '[메시지 내용 없음]';
        }

        const backup = new ReportedMessageBackup(backupData);
        return await backup.save();

    } catch (error) {
        console.error(`❌ [단일백업] 실패 (${message._id}):`, error.message);
        return null;
    }
};

/**
 * 관리자용 메시지 복호화 및 접근 로그 기록
 * @param {string} messageId - 메시지 ID
 * @param {string} adminId - 관리자 ID
 * @param {string} purpose - 접근 목적
 * @param {string} ipAddress - IP 주소
 * @param {string} userAgent - User Agent
 * @returns {string} 복호화된 메시지 내용
 */
export const decryptMessageForAdmin = async (messageId, adminId, purpose, ipAddress, userAgent) => {
    try {
        console.log(`🔍 [관리자접근] 메시지 복호화 요청: ${messageId}`);

        // 1. 백업된 메시지 조회
        const backup = await ReportedMessageBackup.findOne({
            originalMessageId: messageId
        });

        if (backup) {
            // 2. 접근 로그 기록
            backup.accessLog.push({
                accessedBy: adminId,
                purpose: purpose || 'admin_review',
                ipAddress: ipAddress,
                userAgent: userAgent
            });
            await backup.save();

            console.log('✅ [관리자접근] 백업에서 복호화된 내용 반환');
            return backup.plaintextContent;
        }

        // 3. 백업이 없으면 실시간 복호화
        const originalMessage = await ChatMessage.findById(messageId).lean();
        if (!originalMessage) {
            throw new Error('메시지를 찾을 수 없습니다');
        }

        if (originalMessage.isEncrypted && originalMessage.encryptedText) {
            const encryptedData = {
                method: 'KMS',
                version: '2.0',
                data: {
                    iv: originalMessage.iv,
                    data: originalMessage.encryptedText,
                    authTag: originalMessage.tag
                }
            };

            const decrypted = await ComprehensiveEncryption.decryptPersonalInfo(
                JSON.stringify(encryptedData)
            );

            console.log('✅ [관리자접근] 실시간 복호화 완료');
            return decrypted;
        }

        return originalMessage.text || '[메시지 내용 없음]';

    } catch (error) {
        console.error('❌ [관리자접근] 복호화 실패:', error.message);
        throw error;
    }
};

/**
 * 친구방 찾기 또는 생성
 *
 * 기능:
 * 1. 차단 관계 검증 (양방향)
 * 2. friendPairId 생성
 * 3. 방 찾기 또는 생성 (원자적 처리)
 * 4. 입장 시간 기록
 * 5. 캐시 무효화
 *
 * @param {string} userId - 현재 사용자 ID
 * @param {string} friendId - 친구 ID
 * @returns {Promise<{room: Object, created: boolean}>}
 *
 * @example
 * const result = await findOrCreateFriendRoom('user123', 'friend456');
 * // { room: { _id, chatUsers, isActive }, created: true }
 */
export const findOrCreateFriendRoom = async (userId, friendId) => {
    try {
        console.log(`🔍 [findOrCreate] 시작: ${userId} <-> ${friendId}`);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🆕 0️⃣ 캐시에서 방 ID 조회
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const cachedRoomId = await IntelligentCache.getCachedFriendRoomId(userId, friendId);

        if (cachedRoomId) {
            // 캐시 히트 - 방 존재 여부 + 차단 관계 확인
            const [roomExists, user, friend] = await Promise.all([
                ChatRoom.exists({ _id: cachedRoomId }),
                User.findById(userId).select('blockedUsers').lean(),
                User.findById(friendId).select('blockedUsers').lean()
            ]);

            // 🆕 방이 DB에 존재하지 않으면 캐시 무효화 후 새로 생성 로직으로 진행
            if (!roomExists) {
                console.log(`⚠️ [캐시 무효] 방이 DB에 없음: ${cachedRoomId}`);
                await IntelligentCache.invalidateFriendRoomId(userId, friendId);
                // 캐시 무효화 후 아래 새 방 생성 로직으로 계속 진행
            } else {
                // 방이 존재하는 경우에만 캐시 결과 사용
                if (!user || !friend) {
                    const err = new Error('사용자를 찾을 수 없습니다.');
                    err.status = 404;
                    err.code = 'USER_NOT_FOUND';
                    throw err;
                }

                // 차단 관계 체크
                const isBlockedByMe = user.blockedUsers?.some(id => id.toString() === friendId);
                const isBlockedByFriend = friend.blockedUsers?.some(id => id.toString() === userId);

                if (isBlockedByMe || isBlockedByFriend) {
                    console.log(`🔒 [findOrCreate] 차단 관계 존재, 캐시 무효화`);

                    // 차단 발생 - 캐시 무효화
                    await IntelligentCache.invalidateFriendRoomId(userId, friendId);

                    const err = new Error('차단 관계가 있는 사용자와 채팅할 수 없습니다.');
                    err.status = 403;
                    err.code = 'BLOCKED_USER';
                    throw err;
                }

                // 입장 시간 기록
                await Promise.all([
                    recordRoomEntry(cachedRoomId, userId),
                    recordRoomEntry(cachedRoomId, friendId)
                ]);

                console.log(`✅ [캐시 HIT] 방 ID: ${cachedRoomId}`);

                return {
                    roomId: cachedRoomId,
                    created: false
                };
            }
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 1️⃣ 차단 관계 검증 (병렬 조회로 성능 최적화)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const [user, friend] = await Promise.all([
            User.findById(userId).select('blockedUsers').lean(),
            User.findById(friendId).select('blockedUsers').lean()
        ]);

        // 사용자 존재 여부 확인
        if (!user || !friend) {
            const err = new Error('사용자를 찾을 수 없습니다.');
            err.status = 404;
            err.code = 'USER_NOT_FOUND';
            throw err;
        }

        // 양방향 차단 체크
        const isBlockedByMe = user.blockedUsers?.some(
            id => id.toString() === friendId
        );
        const isBlockedByFriend = friend.blockedUsers?.some(
            id => id.toString() === userId
        );

        if (isBlockedByMe || isBlockedByFriend) {
            console.log(`🔒 [findOrCreate] 차단 관계 존재`);
            const err = new Error('차단 관계가 있는 사용자와 채팅할 수 없습니다.');
            err.status = 403;
            err.code = 'BLOCKED_USER';
            throw err;
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 2️⃣ friendPairId 생성 (항상 정렬하여 일관성 보장)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const sortedIds = [userId, friendId]
            .map(id => id.toString())
            .sort();
        const friendPairId = sortedIds.join('_');

        console.log(`🔑 [findOrCreate] friendPairId: ${friendPairId}`);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 3️⃣ findOneAndUpdate with upsert (원자적 처리)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // findOneAndUpdate + upsert = race condition 해결
        // 동시에 두 요청이 와도 MongoDB가 하나만 생성
        const room = await ChatRoom.findOneAndUpdate(
            {
                // 찾기 조건: 이 friendPairId를 가진 방이 있는가?
                friendPairId: friendPairId
            },
            {
                // 없으면 생성할 때 사용할 값들
                $setOnInsert: {
                    roomType: 'friend',
                    capacity: 2,
                    chatUsers: sortedIds,
                    friendPairId: friendPairId,  // Pre-save Hook이 재정렬
                    isActive: true
                }
            },
            {
                upsert: true,              // 없으면 생성
                new: true,                 // 업데이트된 문서 반환
                setDefaultsOnInsert: true  // 기본값 적용
            }
        ).lean();  // 성능 최적화: Plain Object 반환


        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 4️⃣ 생성 여부 판단 (타임스탬프 비교)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // createdAt이 1초 이내 = 방금 생성됨
        const wasCreated = room.createdAt &&
            (Date.now() - new Date(room.createdAt).getTime()) < 1000;


        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  3.5 방 ID 캐싱 (항상 실행)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        await IntelligentCache.cacheFriendRoomId(sortedIds[0], sortedIds[1], room._id.toString());


        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 5️⃣ 캐시 무효화 (새로 생성된 경우만)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (wasCreated) {
            await IntelligentCache.invalidateFriendRoomCache(sortedIds[0], sortedIds[1]);
            console.log(`🆕 [findOrCreate] 새 방 생성: ${room._id}`);
        } else {
            console.log(`♻️ [findOrCreate] 기존 방 재사용: ${room._id}`);
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 6️⃣ 입장 시간 기록 (병렬 처리)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        await Promise.all([
            recordRoomEntry(room._id, userId),
            recordRoomEntry(room._id, friendId)
        ]);

        console.log(`✅ [findOrCreate] 성공: ${room._id}`);

        return {
            roomId: room._id.toString(),  // ✅ 방 ID만 문자열로 반환
            created: wasCreated
        };

    } catch (error) {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 7️⃣ 중복 키 에러 처리 (동시 요청 시 발생 가능)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // MongoDB 에러 코드 11000 = Duplicate Key Error
        if (error.code === 11000) {
            console.log('⚠️ [findOrCreate] 중복 키 에러, 재조회');

            // friendPairId 재생성
            const sortedIds = [userId, friendId]
                .map(id => id.toString())
                .sort();
            const friendPairId = sortedIds.join('_');

            // 방 재조회 (이미 존재하는 방)
            const room = await ChatRoom.findOne({
                friendPairId: friendPairId
            }).lean();

            if (!room) {
                throw new Error('중복 키 에러 후 방을 찾을 수 없습니다.');
            }

            // 🆕 캐싱 추가
            await IntelligentCache.cacheFriendRoomId(sortedIds[0], sortedIds[1], room._id.toString());

            // 입장 시간 기록
            await Promise.all([
                recordRoomEntry(room._id, userId),
                recordRoomEntry(room._id, friendId)
            ]);

            return {
                roomId: room._id.toString(),
                created: false
            };
        }

        console.error('❌ [findOrCreate] 오류:', error);
        throw error;
    }
};