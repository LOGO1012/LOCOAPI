// src/controllers/developerController.js
import { User } from "../models/UserProfile.js";

export const getDeveloperUsers = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const searchQuery = req.query.query;
    let filter = {};

    if (searchQuery && searchQuery.trim() !== "") {
        const regex = new RegExp(searchQuery, "i");
        filter = {
            $or: [
                { name: regex },
                { nickname: regex },
                { phone: regex },
                { gender: regex }
                // 추가 검색 대상 필요 시 더 넣을 수 있음
            ]
        };
    }

    try {
        // 필요한 모든 필드를 선택합니다.
        const users = await User.find(filter)
            .select("photo name nickname phone birthdate gender coinLeft plan accountLink social star userLv numOfReport")
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();
        const total = await User.countDocuments(filter);
        res.json({ total, page, limit, results: users });
    } catch (err) {
        console.error("Error fetching developer users:", err);
        res.status(500).json({ message: err.message });
    }
};

// 유저 수정 (PATCH) 함수
export const updateDeveloperUser = async (req, res) => {
    const { userId } = req.params;
    try {
        // req.body에 프론트엔드에서 수정된 데이터가 담겨 있습니다.
        const updatedUser = await User.findByIdAndUpdate(userId, req.body, { new: true }).lean();
        if (!updatedUser) {
            return res.status(404).json({ message: "User not found" });
        }
        // 업데이트된 유저 정보를 응답으로 보냅니다.
        res.json(updatedUser);
    } catch (err) {
        console.error("Error updating developer user:", err);
        res.status(500).json({ message: err.message });
    }
};