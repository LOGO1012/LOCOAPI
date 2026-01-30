// Report 모델을 가져옵니다.
import { Report } from '../models/report.js';
import { User } from '../models/UserProfile.js';
import {ReportNotification} from "../models/ReportNotification.js";
import { createReportedMessageBackup } from './chatService.js'; // 추가
import IntelligentCache from '../utils/cache/intelligentCache.js';

/**
 * 신고 생성 함수
 * @param {Object} data - 클라이언트로부터 전달된 신고 데이터
 * @returns {Promise<Object>} 생성된 신고 객체
 */
export const createReport = async (data) => {
    try {
        // 신고 문서 저장
        const report = await new Report({
            ...data
        }).save();
        
        // ✅ 채팅 메시지 신고인 경우 isReported 필드 업데이트
        if (data.targetType === 'message' && data.targetId) {
            try {
                console.log(`[신고처리] 메시지 isReported 업데이트: ${data.targetId}`);
                
                // ChatMessage에서 isReported = true로 업데이트
                const { ChatMessage } = await import('../models/chat.js');
                await ChatMessage.findByIdAndUpdate(
                    data.targetId,
                    { 
                        isReported: true,
                        reportedAt: new Date(),
                        $addToSet: { reportedBy: data.reportErId } // 중복 방지하여 신고자 추가
                    }
                );
                
                console.log(`✅ [신고처리] 메시지 isReported 업데이트 완료`);
                
                // 메시지 백업 생성
                // ✅ reason enum 값으로 매핑
                const reasonMapping = {
                    '욕설, 모욕, 혐오발언': 'harassment',
                    '스팸, 도배, 거짓정보': 'spam',
                    '부적절한 메세지(성인/도박/마약 등)': 'inappropriate',
                    '규칙에 위반되는 프로필/모욕성 닉네임': 'inappropriate',
                    '음란물 (이미지)': 'inappropriate'
                };
                
                const mappedReason = reasonMapping[data.reportCategory] || 'other';
                
                const backupResult = await createReportedMessageBackup(data.targetId, {
                    reportedBy: data.reportErId,
                    reason: mappedReason,  // ✅ enum 값으로 전달
                    reportId: report._id
                });
                
                console.log(`[신고처리] 백업 결과:`, {
                    success: backupResult.success,
                    backupCreated: backupResult.backupCreated,
                    contentLength: backupResult.contentLength
                });
                
            } catch (backupError) {
                console.error(`[신고처리] 메시지 처리 실패:`, backupError);
                // 메시지 업데이트나 백업 실패해도 신고는 계속 진행
            }
        }

        /* ──────────────  추가: 가해자 numOfReport 증가 ────────────── */
        await User.findByIdAndUpdate(
            data.offenderId,
            { $inc: { numOfReport: 1 } },
            { new: false }            // 반환값 필요 없으면 false
        );
        /* ────────────────────────────────────────────────────────── */

        return { success: true, reportId: report._id }; // 전체 객체 대신 ID만 반환
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
        return await Report.findById(id)
            .select('reportTitle reportArea reportCategory reportContants reportErId offenderId adminId stopDetail stopDate durUntil anchor reportAnswer reportStatus createdAt')
            .populate('reportErId', 'nickname')
            .populate('offenderId', 'nickname')
            .populate('adminId', 'nickname')
            .lean();
    } catch (error) {
        throw error;
    }
};

export const getReportsWithPagination = async (filters = {}, page = 1, size = 10, orderByDate = 'desc') => {
    try {
        const skip = (page - 1) * size;

        // 정렬 순서 결정: 'asc'면 1 (오래된 순), 그 외는 -1 (최신순)
        const sortOrder = orderByDate === 'asc' ? 1 : -1;

        const reportsPromise = Report.find(filters)
            .select('reportTitle reportArea reportContants reportStatus reportErId offenderId adminId createdAt') // ◀◀◀ 필드 선택
            .skip(skip)
            .limit(size)
            .sort({ createdAt: sortOrder }) // 동적 정렬 적용
            .populate('reportErId', 'nickname')
            .populate('offenderId', 'nickname')
            .populate('adminId', 'nickname');

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
export const addReplyToReport = async (id, replyContent, adminUser, suspensionDays, stopDetail) => {
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

        const updatedReport = await Report.findByIdAndUpdate(
            id,
            {
                reportAnswer: replyContent,
                adminId: adminUser._id, // adminUser 객체에서 ID 사용
                reportStatus: reportStatus,
                stopDetail: stopDetail ? stopDetail : (suspensionDays && parseInt(suspensionDays) > 0 ? '일시정지' : '활성'),
                stopDate: suspensionDays && parseInt(suspensionDays) > 0 ? now : null,
                durUntil: suspensionDays && parseInt(suspensionDays) > 0 ? durUntil : null,
            },
            { new: true }
        )
            .populate('reportErId', 'nickname')
            .populate('offenderId', 'nickname')
            .populate('adminId', 'nickname');

        // 신고당한(가해자) 사용자의 신고 횟수 증가 및 정지 상태 적용 (채팅 관련 필드는 업데이트하지 않음)
        const offenderId = updatedReport.offenderId._id || updatedReport.offenderId;
        let updateFields = {};

        if (updatedReport.stopDetail === '일시정지' || updatedReport.stopDetail === '영구정지') {
            updateFields.$set = {
                reportStatus: updatedReport.stopDetail, // '알시정지' 또는 '영구정지'로 업데이트
                reportTimer: updatedReport.durUntil       // 정지 해제 시각으로 설정
            };
        } else {
            updateFields.$set = {
                reportStatus: '활성',
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
        console.log(`[알림] 신고자(${reporterId})에게 답변 알림 생성 완료`);

        // 가해자에게 신고 제재 알림 생성 (정지 기간이 있다면 기간 정보 포함)
        await ReportNotification.create({
            receiver: offenderId,
            content: `신고 제재: ${updatedReport.stopDetail}${(suspensionDays && parseInt(suspensionDays) > 0) ? ` (${suspensionDays}일 정지)` : ''}`,
            type: 'sanctionInfo'
        });
        console.log(`[알림] 가해자(${offenderId})에게 제재 알림 생성 완료`);
        
        // --- 캐시 무효화 ---
        await IntelligentCache.deleteCache(`notifications:${reporterId.toString()}`);
        await IntelligentCache.deleteCache(`notifications:${offenderId.toString()}`);
        console.log(`[캐시] 알림 캐시 삭제 완료: ${reporterId}, ${offenderId}`);
        // --- 캐시 무효화 끝 ---

        return updatedReport;
    } catch (error) {
        throw error;
    }
};




