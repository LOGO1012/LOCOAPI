// src/controllers/prController.js
import { User } from "../models/UserProfile.js";
import * as onlineStatusService from "../services/onlineStatusService.js";

const mapGenderKor = (g) => {
    if (g === "male") return "남성";
    if (g === "female") return "여성";
    return "비공개";
};

// 상위 10명 (별점 기준 내림차순)
export const getPRTopUsers = async (req, res, next) => {
    try {
        const topUsersRaw = await User.find({ isPublicPR: { $ne: false } }) // ✅ 비공개 유저 제외
            .sort({ star: -1 })
            .limit(10)
            .select('_id nickname profilePhoto star gender') // ◀◀◀ Select 절 추가
            .lean();
        
        // 🔧 온라인 상태 정보 추가 (배치로 효율적 처리)
        const userIds = topUsersRaw.map(u => u._id.toString());
        const onlineStatusMap = await onlineStatusService.getMultipleUserStatus(userIds);

        const topUsers = topUsersRaw.map(u => ({
            ...u,
            gender: mapGenderKor(u.gender),
            isOnline: onlineStatusMap[u._id.toString()] || false
        }));

        return res.status(200).json({ data: topUsers });
    } catch (err) {
        next(err);
    }
};

// 필터/정렬/페이지네이션 적용 유저 목록
export const getPRUserList = async (req, res, next) => {
    try {
        let { sort = "star|desc", gender = "all", page = 1, limit = 5 } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);

        const query = { isPublicPR: { $ne: false } }; // ✅ 비공개 유저 제외
        if (gender !== "all") query.gender = gender;
        let sortOption = {};

        if (sort === "online") {
            const onlineUserIds = await onlineStatusService.getAllOnlineUsers();
            query._id = { $in: onlineUserIds };
            sortOption = { star: -1 }; // 온라인 사용자들을 별점 높은순으로 정렬
        } else if (sort === "new") {
            sortOption = { createdAt: -1 };
        } else if (sort === "rating") {
            sortOption = { star: -1 };
        } else if (sort === "lowRating") {
            sortOption = { star: 1 };
        } else { // recommend (추천순) 또는 기본값
            sortOption = { star: -1 };
        }

        const totalCount = await User.countDocuments(query);
        const usersRaw = await User.find(query)
            .sort(sortOption)
            .skip((page - 1) * limit)
            .limit(limit)
            .select('_id nickname lolNickname profilePhoto photo star gender info') // ◀◀◀ Select 절 추가
            .lean();

        // 🔧 온라인 상태 정보 추가 (배치로 효율적 처리)
        const userIds = usersRaw.map(u => u._id.toString());
        const onlineStatusMap = await onlineStatusService.getMultipleUserStatus(userIds);
        
        const users = usersRaw.map(u => ({
            ...u,
            gender: mapGenderKor(u.gender),
            isOnline: onlineStatusMap[u._id.toString()] || false
        }));

        return res.status(200).json({
            data: users,
            totalCount,
            currentPage: page,
            totalPages: Math.ceil(totalCount / limit),
        });
    } catch (err) {
        next(err);
    }
};
