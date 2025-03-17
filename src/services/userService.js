// services/userService.js
import { User } from "../models/UserProfile.js";

// 유저 정보를 불러오는 서비스 함수
export const getUserById = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error("사용자를 찾을 수 없습니다.");
        }
        return user;
    } catch (error) {
        throw new Error(error.message);
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


