// src/controllers/prController.js
import { User } from "../models/UserProfile.js";
import moment from "moment";

const mapGenderKor = (g) => {
    if (g === "male") return "남성";
    if (g === "female") return "여성";
    return "비공개";
};

// 상위 10명 (별점 기준 내림차순)
export const getPRTopUsers = async (req, res, next) => {
    try {
        const topUsersRaw = await User.find().sort({ star: -1 }).limit(10).lean();
        const topUsers = topUsersRaw.map(u => ({
            ...u,
            gender: mapGenderKor(u.gender),
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

        const query = {};
        if (gender !== "all") query.gender = gender;
        let sortOption = {};

        if (sort === "online") {
            const tenMinutesAgo = moment().subtract(10, "minutes").toDate();
            query.lastLogin = { $gte: tenMinutesAgo };
        } else if (sort === "star|asc") {
            sortOption = { star: 1 };
        } else {
            sortOption = { star: -1 };
        }

        const totalCount = await User.countDocuments(query);
        const usersRaw = await User.find(query)
            .sort(sortOption)
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const users = usersRaw.map(u => ({
            ...u,
            gender: mapGenderKor(u.gender),
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
