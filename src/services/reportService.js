// Report 모델을 가져옵니다.
import { Report } from '../models/report.js';
import { User } from '../models/UserProfile.js';
import {ReportNotification} from "../models/ReportNotification.js";

/**
 * 신고 생성 함수
 * @param {Object} data - 클라이언트로부터 전달된 신고 데이터
 * @returns {Promise<Object>} 생성된 신고 객체
 */
export const createReport = async (data) => {
    try {
        // 사용자 닉네임 조회
        const offender = await User.findById(data.offenderId, 'nickname');
        const reporter = await User.findById(data.reportErId, 'nickname');

        // 스냅샷 필드에 닉네임 저장
        const report = new Report({
            ...data,
            offenderNickname: offender?.nickname || '',
            reportErNickname: reporter?.nickname  || ''
        });
        return await report.save();
    } catch (error) {
        throw error;
    }
};

/**
 * ID를 이용하여 단일 신고 조회 함수
 * @param {String} id - 신고의 고유 ID
 * @returns {Promise<Object>} 해당 ID를 가진 신고 객체
 */
export const getReportById = async (id) => {
    try {
        // Report 컬렉션에서 id에 해당하는 신고 찾기
        return await Report.findById(id);
    } catch (error) {
        throw error;
    }
};

export const getReportsWithPagination = async (filters = {}, page = 1, size = 10) => {
    try {
        const skip = (page - 1) * size;
        const reportsPromise = Report.find(filters)
            .skip(skip)
            .limit(size)
            .populate('reportErId', 'nickname')
            .populate('offenderId', 'nickname')
            .populate('adminId',   'nickname');
        const countPromise = Report.countDocuments(filters);
        const [reports, totalCount] = await Promise.all([reportsPromise, countPromise]);
        return { reports, totalCount };
    } catch (error) {
        throw error;
    }
};

/**
 * 신고 업데이트 함수
 * @param {String} id - 업데이트할 신고의 고유 ID
 * @param {Object} data - 업데이트할 데이터
 * @returns {Promise<Object>} 업데이트 후 반환된 신고 객체
 */
export const updateReport = async (id, data) => {
    try {
        // findByIdAndUpdate를 사용해 신고를 업데이트하고, { new: true } 옵션으로 최신 데이터를 반환
        return await Report.findByIdAndUpdate(id, data, { new: true });
    } catch (error) {
        throw error;
    }
};

/**
 * 신고 삭제 함수
 * @param {String} id - 삭제할 신고의 고유 ID
 * @returns {Promise<Object>} 삭제된 신고 객체
 */
export const deleteReport = async (id) => {
    try {
        // Report 컬렉션에서 해당 ID를 가진 신고를 삭제
        return await Report.findByIdAndDelete(id);
    } catch (error) {
        throw error;
    }
};

/**
 * 신고에 답변 추가하기 (관리자 ID와 제재 내용을 함께 저장)
 */
export const addReplyToReport = async (id, replyContent, adminId, suspensionDays, stopDetail) => {
    try {
        const now = new Date();
        let durUntil = null;
        if (suspensionDays && parseInt(suspensionDays) > 0) {
            durUntil = new Date(now.getTime() + parseInt(suspensionDays) * 24 * 60 * 60 * 1000);
        }

        // 기본 상태는 답변만 달린 경우 reviewed
        let reportStatus = "reviewed";
        // 정지(또는 영구 정지) 적용 시 resolved, 경고만 준 경우 dismissed
        if ((stopDetail === "영구정지" || stopDetail === "일시정지") || (suspensionDays && parseInt(suspensionDays) > 0)) {
            reportStatus = "resolved";
        } else if (stopDetail === "경고") {
            reportStatus = "dismissed";
        }

        const admin = await User.findById(adminId, 'nickname');
        const updatedReport = await Report.findByIdAndUpdate(
            id,
            {
                reportAnswer: replyContent,
                adminId: adminId,
                reportStatus: reportStatus,
                stopDetail: stopDetail ? stopDetail : (suspensionDays && parseInt(suspensionDays) > 0 ? 'suspended' : 'active'),
                stopDate: suspensionDays && parseInt(suspensionDays) > 0 ? now : null,
                durUntil: suspensionDays && parseInt(suspensionDays) > 0 ? durUntil : null,
                adminNickname:  admin.nickname,

            },
            { new: true }
        )
            .populate('reportErId', 'nickname')
            .populate('offenderId', 'nickname');

        // 신고당한(가해자) 사용자의 신고 횟수 증가 및 정지 상태 적용 (채팅 관련 필드는 업데이트하지 않음)
        const offenderId = updatedReport.offenderId;
        let updateFields = { $inc: { numOfReport: 1 } };

        if (updatedReport.stopDetail === 'suspended' || updatedReport.stopDetail === 'banned') {
            updateFields.$set = {
                reportStatus: updatedReport.stopDetail, // 'suspended' 또는 'banned'로 업데이트
                reportTimer: updatedReport.durUntil       // 정지 해제 시각으로 설정
            };
        } else {
            updateFields.$set = {
                reportStatus: 'active',
                reportTimer: null
            };
        }

        await User.findByIdAndUpdate(offenderId, updateFields);

        // --- 알림 생성 부분 추가 ---
        // 신고자(신고를 한 사용자)에게 신고 답변 알림 생성
        const reporterId = updatedReport.reportErId._id || updatedReport.reportErId;
        await ReportNotification.create({
            receiver: reporterId,
            content: `신고 답변: ${replyContent}`,
            type: 'reportAnswer'
        });

        // 가해자에게 신고 제재 알림 생성 (정지 기간이 있다면 기간 정보 포함)
        await ReportNotification.create({
            receiver: offenderId,
            content: `신고 제재: ${updatedReport.stopDetail}${(suspensionDays && parseInt(suspensionDays) > 0) ? ` (${suspensionDays}일 정지)` : ''}`,
            type: 'sanctionInfo'
        });
        // --- 알림 생성 부분 끝 ---

        return updatedReport;
    } catch (error) {
        throw error;
    }
};




