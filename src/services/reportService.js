// Report 모델을 가져옵니다.
import { Report } from '../models/report.js';

/**
 * 신고 생성 함수
 * @param {Object} data - 클라이언트로부터 전달된 신고 데이터
 * @returns {Promise<Object>} 생성된 신고 객체
 */
export const createReport = async (data) => {
    try {
        // 전달된 데이터를 기반으로 새로운 Report 인스턴스 생성
        const report = new Report(data);
        // 데이터베이스에 저장하고 생성된 객체를 반환
        return await report.save();
    } catch (error) {
        // 에러 발생 시 상위로 전파
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
            .populate('offenderId', 'nickname');
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

// 신고에 답변 추가하기 (관리자 ID와 제재 내용을 함께 저장)
export const addReplyToReport = async (id, replyContent, adminId, suspensionDays, stopDetail) => {
    try {
        const now = new Date();
        let durUntil = null;
        if (suspensionDays && parseInt(suspensionDays) > 0) {
            durUntil = new Date(now.getTime() + parseInt(suspensionDays) * 24 * 60 * 60 * 1000);
        }

        // 기본 상태는 답변만 달린 경우 reviewed
        let reportStatus = "reviewed";
        // 정지 기간(또는 영구 정지) 적용 시 resolved
        if ((stopDetail === "banned" || stopDetail === "suspended") || (suspensionDays && parseInt(suspensionDays) > 0)) {
            reportStatus = "resolved";
        }
        // 경고만 준 경우 dismissed
        else if (stopDetail === "warning") {
            reportStatus = "dismissed";
        }

        const updatedReport = await Report.findByIdAndUpdate(
            id,
            {
                reportAnswer: replyContent,
                adminId: adminId,
                reportStatus: reportStatus,
                // 클라이언트에서 stopDetail이 전달되면 우선 사용, 없으면 suspensionDays 기준으로 설정
                stopDetail: stopDetail ? stopDetail : (suspensionDays && parseInt(suspensionDays) > 0 ? 'suspended' : 'active'),
                stopDate: suspensionDays && parseInt(suspensionDays) > 0 ? now : null,
                durUntil: suspensionDays && parseInt(suspensionDays) > 0 ? durUntil : null
            },
            { new: true }
        )
            .populate('reportErId', 'nickname')
            .populate('offenderId', 'nickname');
        return updatedReport;
    } catch (error) {
        throw error;
    }
};




