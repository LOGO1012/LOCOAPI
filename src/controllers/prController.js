// src/controllers/prController.js
import { User } from "../models/UserProfile.js";
import moment from "moment";

// 상위 10명 (별점 기준 내림차순)
export const getPRTopUsers = async (req, res, next) => {
    try {
        const topUsers = await User.find().sort({ star: -1 }).limit(10).lean();
        return res.status(200).json({ data: topUsers });
    } catch (err) {
        next(err);
    }
};

// 필터/정렬/페이지네이션 적용 유저 목록
// 기본: 정렬은 "star|desc" (별점 높은순), 성별 필터는 "all", 페이지당 30개
export const getPRUserList = async (req, res, next) => {
    try {
        let { sort = "star|desc", gender = "all", page = 1, limit = 30 } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const query = {};

        if (gender !== "all") {
            query.gender = gender;
        }

        let sortOption = {};
        if (sort === "online") {
            // 온라인: 최근 10분 이내 lastLogin 기록이 있는 사용자
            const tenMinutesAgo = moment().subtract(10, "minutes").toDate();
            query.lastLogin = { $gte: tenMinutesAgo };
        } else if (sort === "star|asc") {
            sortOption = { star: 1 };
        } else if (sort === "star|desc") {
            sortOption = { star: -1 };
        }

        const totalCount = await User.countDocuments(query);
        const users = await User.find(query)
            .sort(sortOption)
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

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
