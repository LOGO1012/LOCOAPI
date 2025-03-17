// controllers/userController.js
import { getUserById } from "../services/userService.js";
import { rateUser } from "../services/userService.js";

// 사용자 정보를 가져오는 컨트롤러 함수
export const getUserInfo = async (req, res) => {
    const { userId } = req.params;
    try {
        const user = await getUserById(userId); // 서비스 호출
        res.status(200).json({
            success: true,
            data: user,
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
};

export const rateUserController = async (req, res) => {
    try {
        const { userId } = req.params;
        const { rating } = req.body;
        const updatedUser = await rateUser(userId, rating);
        res.status(200).json({
            success: true,
            message: "User rated successfully.",
            user: updatedUser
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};


