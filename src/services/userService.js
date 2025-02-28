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

