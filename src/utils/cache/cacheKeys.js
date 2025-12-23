/**
 * 캐시 키 관리 중앙 파일
 *
 * 장점:
 * - 모든 캐시 키를 한 곳에서 관리
 * - ObjectId/String 자동 변환으로 타입 이슈 해결
 * - IDE 자동완성으로 오타 방지
 * - 캐시 키 형식 변경 시 한 곳만 수정
 */

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🎯 헬퍼 함수: ObjectId를 안전하게 String으로 변환
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 이미 String이면 그대로 반환
 * ObjectId면 .toString() 호출
 *
 * @param {string|ObjectId} id - 변환할 ID
 * @returns {string} - 문자열 ID
 */
const toStringId = (id) => {
    if (!id) return '';

    // ObjectId 타입 체크
    if (id.toString && typeof id.toString === 'function') {
        return id.toString();
    }

    // 이미 String이면 그대로 반환
    return String(id);
};

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 📦 캐시 키 상수 객체
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
export const CacheKeys = {
    /**
     * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     * 👥 친구 요청 관련 캐시 키
     * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     */

    /**
     * 친구 요청 목록 캐시 키
     *
     * 사용처:
     * - getFriendRequests (조회)
     * - sendFriendRequest (무효화)
     * - acceptFriendRequestService (무효화)
     * - declineFriendRequestService (무효화)
     *
     * TTL: 60초
     *
     * @param {string|ObjectId} userId - 받는 사람 ID
     * @returns {string} - 캐시 키 (예: "friend_requests_68edf64310bf5ce79261de02")
     */
    FRIEND_REQUESTS: (userId) => `friend_requests_${toStringId(userId)}`,

    /**
     * 친구 요청 개수 캐시 키
     *
     * 사용처:
     * - getFriendRequestCountController (조회)
     * - sendFriendRequest (무효화)
     * - acceptFriendRequestService (무효화)
     * - declineFriendRequestService (무효화)
     *
     * TTL: 60초
     *
     * @param {string|ObjectId} userId - 받는 사람 ID
     * @returns {string} - 캐시 키 (예: "friend_requests_count_68edf64310bf5ce79261de02")
     */
    FRIEND_REQUESTS_COUNT: (userId) => `friend_requests_count_${toStringId(userId)}`,

    /**
     * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     * 👤 사용자 정보 관련 캐시 키 (기존 키들도 여기 추가 가능)
     * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     */

    /**
     * 인증 사용자 정보 캐시 키
     *
     * @param {string|ObjectId} userId - 사용자 ID
     * @returns {string} - 캐시 키
     */
    AUTH_USER: (userId) => `auth_user_${toStringId(userId)}`,

    /**
     * 사용자 정적 정보 캐시 키
     *
     * @param {string|ObjectId} userId - 사용자 ID
     * @returns {string} - 캐시 키
     */
    USER_STATIC: (userId) => `user_static_${toStringId(userId)}`,

    /**
     * 사용자 친구 ID 목록 캐시 키
     *
     * @param {string|ObjectId} userId - 사용자 ID
     * @returns {string} - 캐시 키
     */
    USER_FRIENDS_IDS: (userId) => `user_friends_ids_${toStringId(userId)}`,

    /**
     * 사용자 프로필 전체 캐시 키
     *
     * @param {string|ObjectId} userId - 사용자 ID
     * @returns {string} - 캐시 키
     */
    USER_PROFILE_FULL: (userId) => `user_profile_full_${toStringId(userId)}`,

    /**
     * 닉네임으로 사용자 조회 캐시 키
     *
     * @param {string} nickname - 닉네임
     * @returns {string} - 캐시 키
     */
    USER_BY_NICKNAME: (nickname) => `user_nickname_${nickname}`,


    /**
     * 사용자 닉네임 캐시 키 (채팅용)
     *
     * 사용처:
     * - socketIO.js (메시지 전송 시 닉네임 조회)
     * - userService.js (닉네임 변경 시 무효화)
     *
     * TTL: 1800초 (30분)
     *
     * @param {string|ObjectId} userId - 사용자 ID
     * @returns {string} - 캐시 키 (예: "user:nickname:68edf64310bf5ce79261de02")
     */
    USER_NICKNAME: (userId) => `user:nickname:${toStringId(userId)}`,



    /**
     * 변경 가능 여부 캐시 키
     *
     * @param {string|ObjectId} userId - 사용자 ID
     * @returns {string} - 캐시 키
     */
    CHANGE_AVAILABILITY: (userId) => `change_availability_${toStringId(userId)}`,

    /**
     * 닉네임 사용 가능 여부 캐시 키
     *
     * 사용처:
     * - checkNicknameController (조회/저장)
     * - registerUserProfile (무효화)
     * - updateUserProfile (무효화)
     * - deactivateUser (무효화)
     *
     * TTL: 1800초 (30분)
     *
     * @param {string} nickname - 닉네임
     * @returns {string} - 캐시 키 (예: "nickname_available_홍길동")
     */
    NICKNAME_AVAILABLE: (nickname) => `nickname_available_${nickname}`,


    /**
     * 사용자가 차단한 사람 목록 캐시 키
     *
     * 사용처:
     * - getAllChatRooms (조회)
     * - blockUser (무효화)
     * - unblockUser (무효화)
     *
     * TTL: 3600초 (1시간)
     *
     * @param {string|ObjectId} userId - 사용자 ID
     * @returns {string} - 캐시 키 (예: "user_blocks_68edf64310bf5ce79261de02")
     */
    USER_BLOCKS: (userId) => `user_blocks_${toStringId(userId)}`,

    /**
     * 사용자를 차단한 사람 목록 캐시 키
     *
     * 사용처:
     * - getAllChatRooms (조회)
     * - blockUser (무효화)
     * - unblockUser (무효화)
     *
     * TTL: 3600초 (1시간)
     *
     * @param {string|ObjectId} userId - 사용자 ID
     * @returns {string} - 캐시 키 (예: "users_blocked_me_68edf64310bf5ce79261de02")
     */
    USERS_BLOCKED_ME: (userId) => `users_blocked_me_${toStringId(userId)}`,

    /**
     * 사용자가 퇴장한 채팅방 목록 캐시 키
     *
     * 사용처:
     * - getAllChatRooms (조회)
     * - leaveChatRoomService (무효화)
     *
     * TTL: 600초 (10분)
     *
     * @param {string|ObjectId} userId - 사용자 ID
     * @returns {string} - 캐시 키 (예: "user_exited_rooms_68edf64310bf5ce79261de02")
     */
    USER_EXITED_ROOMS: (userId) => `user_exited_rooms_${toStringId(userId)}`,

    /**
     * 친구방 ID 캐시 키
     *
     * 사용처:
     * - findOrCreateFriendRoom (조회/저장)
     * - 친구 삭제 시 (무효화)
     *
     * TTL: 무제한 (친구 관계 유지 시까지)
     *
     * @param {string|ObjectId} userId1 - 사용자1 ID
     * @param {string|ObjectId} userId2 - 사용자2 ID
     * @returns {string} - 캐시 키 (정렬된 ID 사용)
     */
    FRIEND_ROOM: (userId1, userId2) => {
        const sorted = [toStringId(userId1), toStringId(userId2)].sort();
        return `friend_room:${sorted[0]}:${sorted[1]}`;
    },

    /**
     * 채팅방 정보 캐시 키
     *
     * 사용처:
     * - getChatRoomById (조회/저장)
     * - addUserToRoom (무효화)
     * - leaveChatRoomService (무효화)
     *
     * TTL: 60초
     *
     * 적용 대상:
     * - 친구 채팅방: 재입장 가능, 장기 세션
     * - 랜덤 채팅방: 새로고침/뒤로가기 시나리오
     *
     * @param {string|ObjectId} roomId - 채팅방 ID
     * @returns {string} - 캐시 키 (예: "chat_room_674ce8270bb103ba30bc5823")
     */
    CHAT_ROOM: (roomId) => `chat_room_${toStringId(roomId)}`,




};

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🛠️ 캐시 무효화 헬퍼 함수 (선택사항)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

/**
 * 친구 요청 관련 캐시 일괄 무효화
 *
 * 사용 시점:
 * - 친구 요청 보내기
 * - 친구 요청 수락
 * - 친구 요청 거절
 *
 * @param {Object} IntelligentCache - 캐시 인스턴스
 * @param {string|ObjectId} userId - 대상 사용자 ID
 * @returns {Promise<void>}
 */
export const invalidateFriendRequestCaches = async (IntelligentCache, userId) => {
    const keys = [
        CacheKeys.FRIEND_REQUESTS(userId),
        CacheKeys.FRIEND_REQUESTS_COUNT(userId)
    ];

    await Promise.all(
        keys.map(key => IntelligentCache.deleteCache(key))
    );

    console.log(`🗑️ [캐시 일괄 무효화] 친구 요청: ${toStringId(userId)}`);
};

/**
 * 사용자 정보 관련 캐시 일괄 무효화
 *
 * 사용 시점:
 * - 프로필 업데이트
 * - 친구 추가/삭제
 *
 * @param {Object} IntelligentCache - 캐시 인스턴스
 * @param {string|ObjectId} userId - 대상 사용자 ID
 * @returns {Promise<void>}
 */
export const invalidateUserCaches = async (IntelligentCache, userId) => {
    const keys = [
        CacheKeys.AUTH_USER(userId),
        CacheKeys.USER_STATIC(userId),
        CacheKeys.USER_FRIENDS_IDS(userId),
        CacheKeys.USER_PROFILE_FULL(userId)
    ];

    await Promise.all(
        keys.map(key => IntelligentCache.deleteCache(key))
    );

    console.log(`🗑️ [캐시 일괄 무효화] 사용자 정보: ${toStringId(userId)}`);
};

/**
 * 닉네임 관련 캐시 일괄 무효화
 *
 * 사용 시점:
 * - 닉네임 변경 (기존 + 새 닉네임 둘 다 무효화)
 * - 회원가입 (신규 닉네임 무효화)
 * - 회원 탈퇴 (닉네임 무효화)
 *
 * @param {Object} IntelligentCache - 캐시 인스턴스
 * @param {...string} nicknames - 무효화할 닉네임들 (가변 인자)
 * @returns {Promise<void>}
 *
 * @example
 * // 단일 닉네임 무효화 (회원가입, 탈퇴)
 * await invalidateNicknameCaches(IntelligentCache, "홍길동");
 *
 * // 여러 닉네임 무효화 (닉네임 변경)
 * await invalidateNicknameCaches(IntelligentCache, "홍길동", "김철수");
 */
export const invalidateNicknameCaches = async (IntelligentCache, ...nicknames) => {
    const keys = nicknames.map(nickname => CacheKeys.NICKNAME_AVAILABLE(nickname));

    await Promise.all(
        keys.map(key => IntelligentCache.deleteCache(key))
    );

    console.log(`🗑️ [캐시 일괄 무효화] 닉네임: ${nicknames.join(', ')}`);
};

/**
 * 사용자 닉네임 캐시 무효화 (ID 기반)
 *
 * 사용 시점:
 * - 닉네임 변경 시 (userService.js의 updateUserProfile)
 * - 프로필 업데이트 시
 *
 * @param {Object} IntelligentCache - 캐시 인스턴스
 * @param {string|ObjectId} userId - 사용자 ID
 * @returns {Promise<void>}
 *
 * @example
 * // 닉네임 변경 후
 * await invalidateUserNicknameCache(IntelligentCache, userId);
 */
export const invalidateUserNicknameCache = async (IntelligentCache, userId) => {
    await IntelligentCache.deleteCache(CacheKeys.USER_NICKNAME(userId));
    console.log(`🗑️ [캐시 무효화] 사용자 닉네임: ${toStringId(userId)}`);
};




/**
 * 채팅방 관련 캐시 일괄 무효화
 *
 * 사용 시점:
 * - 사용자 차단 시
 * - 사용자 차단 해제 시
 *
 * @param {Object} IntelligentCache - 캐시 인스턴스
 * @param {string|ObjectId} userId1 - 사용자1 ID
 * @param {string|ObjectId} userId2 - 사용자2 ID (차단 대상)
 * @returns {Promise<void>}
 */
export const invalidateChatRoomCaches = async (IntelligentCache, userId1, userId2) => {
    const keys = [
        CacheKeys.USER_BLOCKS(userId1),
        CacheKeys.USER_BLOCKS(userId2),
        CacheKeys.USERS_BLOCKED_ME(userId1),
        CacheKeys.USERS_BLOCKED_ME(userId2),
    ];

    await Promise.all(
        keys.map(key => IntelligentCache.deleteCache(key))
    );

    console.log(`🗑️ [캐시 일괄 무효화] 채팅방 캐시: ${toStringId(userId1)} ↔ ${toStringId(userId2)}`);
};

/**
 * 퇴장 캐시 무효화
 *
 * 사용 시점:
 * - 채팅방 퇴장 시
 *
 * @param {Object} IntelligentCache - 캐시 인스턴스
 * @param {string|ObjectId} userId - 사용자 ID
 * @returns {Promise<void>}
 */
export const invalidateExitedRooms = async (IntelligentCache, userId) => {
    await IntelligentCache.deleteCache(CacheKeys.USER_EXITED_ROOMS(userId));
    console.log(`🗑️ [캐시 무효화] 퇴장 목록: ${toStringId(userId)}`);
};
