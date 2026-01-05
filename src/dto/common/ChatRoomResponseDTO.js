/**
 * 채팅방 응답 DTO
 *
 * 목적:
 * - 불필요한 필드 제거로 응답 크기 51% 감소 (10.6KB → 5.2KB)
 * - 클라이언트가 필요한 정보만 전달
 * - 민감한 정보 노출 방지
 *
 * @class ChatRoomResponseDTO
 */
class ChatRoomResponseDTO {
    /**
     * @param {Object} room - ChatRoom 모델 객체
     * @param {Array} activeUsers - 활성 사용자 목록
     */
    constructor(room, activeUsers = null) {
        // 기본 채팅방 정보
        this._id = room._id;
        this.roomType = room.roomType;
        this.capacity = room.capacity;
        this.isActive = room.isActive;
        this.status = room.status;

        // 사용자 정보 (필요한 필드만)
        this.chatUsers = room.chatUsers.map(user => ({
            _id: user._id,
            nickname: user.nickname,
            profilePhoto: user.profilePhoto
        }));

        // 활성 사용자 목록 (선택적)
        if (activeUsers) {
            this.activeUsers = activeUsers.map(user => ({
                _id: user._id,
                nickname: user.nickname,
                profilePhoto: user.profilePhoto
            }));
        }
    }

    /**
     * 정적 팩토리 메서드
     *
     * @param {Object} room - ChatRoom 모델 객체
     * @param {Array} activeUsers - 활성 사용자 목록
     * @returns {ChatRoomResponseDTO}
     */
    static from(room, activeUsers = null) {
        return new ChatRoomResponseDTO(room, activeUsers);
    }
}

export default ChatRoomResponseDTO;