// ============================================================================
//   인증 전용 사용자 조회 함수 (userService.js에 추가할 코드)
// ============================================================================

import { User } from '../models/UserProfile.js';

/**
 * 인증용 사용자 정보 조회 (getCurrentUser 전용)
 * - 로그인 유지에 필요한 최소한의 정보만 반환
 * - getUserById()보다 훨씬 가벼움 (채팅 할당량 계산 제외)
 * - 페이지 새로고침 시 로그인 유지를 위해 사용
 */
export const getUserForAuth = async (userId) => {
    try {
        const user = await User.findById(userId)
            .select(
                '_id nickname email status ' +
                'profilePhoto gender social createdAt'
            )
            .lean();
        
        if (!user) throw new Error("사용자를 찾을 수 없습니다.");
        
        console.log(`✅ [인증] 사용자 정보 조회 성공: ${userId}`);
        return user;
    } catch (err) {
        console.error(`❌ [인증] 사용자 정보 조회 실패: ${userId}`, err.message);
        throw new Error(err.message);
    }
};
