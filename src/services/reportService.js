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
                    '부적절한 닉네임 / 모욕성 닉네임': 'inappropriate',
                    '부적절한 프로필 이미지 / 음란물 (이미지)': 'inappropriate'
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
        // 1. 먼저 신고 기본 정보를 가져옵니다. (offenderId는 ID만)
        const report = await Report.findById(id)
            .select('reportTitle reportArea reportCategory reportContants reportErId offenderId adminId stopDetail stopDate durUntil anchor reportAnswer reportStatus createdAt')
            .populate('reportErId', 'nickname')
            .populate('adminId', 'nickname')
            .lean();

        if (!report) return null;

        // 2. 가해자 정보 채우기 (조건부 필드 선택)
        // 신고 구역이 '프로필'이면서 카테고리에 '이미지'가 포함된 경우에만 사진 필드를 가져옴
        const needsImages = report.reportArea === '프로필' && report.reportCategory.includes('이미지');
        const offenderFields = needsImages ? 'nickname profilePhoto photo' : 'nickname';

        const populatedReport = await Report.populate(report, {
            path: 'offenderId',
            select: offenderFields
        });

        // 3. 커뮤니티(게시글, 댓글 등) 증거 추가 조회 (텍스트 + 이미지)
        if (report.reportArea === '커뮤니티' && report.anchor) {
            const { type, targetId } = report.anchor;
            let contentImages = [];
            let contentText = '';

            try {
                if (type === 'post') {
                    const { Community } = await import('../models/Community.js');
                    const post = await Community.findById(targetId).select('communityImages communityContents').lean();
                    contentImages = (post?.communityImages || []).map(img => img.startsWith('/uploads') ? img : `/uploads${img}`);
                    contentText = post?.communityContents || '';
                } else if (type === 'comment') {
                    const { Comment } = await import('../models/Comment.js');
                    const comment = await Comment.findById(targetId).select('commentImage commentContents').lean();
                    if (comment?.commentImage) {
                        const img = comment.commentImage;
                        contentImages = [img.startsWith('/uploads') ? img : `/uploads${img}`];
                    }
                    contentText = comment?.commentContents || '';
                } else if (type === 'reply') {
                    const { Reply } = await import('../models/Reply.js');
                    const reply = await Reply.findById(targetId).select('replyImage commentContents').lean();
                    if (reply?.replyImage) {
                        const img = reply.replyImage;
                        contentImages = [img.startsWith('/uploads') ? img : `/uploads${img}`];
                    }
                    contentText = reply?.commentContents || '';
                } else if (type === 'subreply') {
                    const { SubReply } = await import('../models/SubReply.js');
                    const subReply = await SubReply.findById(targetId).select('subReplyImage commentContents').lean();
                    if (subReply?.subReplyImage) {
                        const img = subReply.subReplyImage;
                        contentImages = [img.startsWith('/uploads') ? img : `/uploads${img}`];
                    }
                    contentText = subReply?.commentContents || '';
                }
                
                // 조회된 데이터를 report 객체에 추가
                populatedReport.contentImages = contentImages;
                populatedReport.contentText = contentText;
            } catch (err) {
                console.error(`[증거조회] 커뮤니티 데이터 로드 실패: ${err.message}`);
            }
        }

        return populatedReport;
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
        let updateFields = { $set: {} };

        if (updatedReport.stopDetail === '일시정지' || updatedReport.stopDetail === '영구정지') {
            updateFields.$set.reportStatus = updatedReport.stopDetail;
            updateFields.$set.reportTimer = updatedReport.durUntil;
        } else {
            updateFields.$set.reportStatus = '활성';
            updateFields.$set.reportTimer = null;
        }

        // ✅ 부적절한 프로필/닉네임 제재 시 자동 초기화 로직
        // 제재 내용이 '활성'(단순 답변)이 아닌 경우에만 실행 (경고, 일시정지, 영구정지 등)
        // 신고 구역이 '프로필'인 경우에만 적용
        const isSanctioned = updatedReport.stopDetail !== '활성';
        const isProfileReport = updatedReport.reportArea === '프로필';
        
        if (isSanctioned && isProfileReport) {
            // 1. 이미지 관련 제재 처리
            if (updatedReport.reportCategory === '부적절한 프로필 이미지 / 음란물 (이미지)') {
                console.log(`[제재 실행] 가해자(${offenderId})의 모든 사진(프로필+앨범)을 삭제합니다.`);
                updateFields.$set.profilePhoto = ''; // 대표 프로필 삭제
                updateFields.$set.photo = [];        // 앨범 이미지 전체 삭제
            } 
            
            // 2. 닉네임 관련 제재 처리
            if (updatedReport.reportCategory === '부적절한 닉네임 / 모욕성 닉네임') {
                const randomNum = Math.floor(1000 + Math.random() * 9000);
                const newNickname = `부적절한닉네임_${randomNum}`;
                console.log(`[제재 실행] 가해자(${offenderId})의 닉네임을 강제 변경합니다: ${newNickname}`);
                updateFields.$set.nickname = newNickname;
            }
        }

        await User.findByIdAndUpdate(offenderId, updateFields);

        // ✅ 프로필 정보가 변경된 경우 캐시 무효화
        if (isSanctioned && isProfileReport && (
            updatedReport.reportCategory === '부적절한 프로필 이미지 / 음란물 (이미지)' || 
            updatedReport.reportCategory === '부적절한 닉네임 / 모욕성 닉네임'
        )) {
            try {
                await IntelligentCache.invalidateUserStaticInfo(offenderId.toString());
                await IntelligentCache.invalidateUserCache(offenderId.toString());
                await IntelligentCache.deleteCache(`user_minimal_${offenderId.toString()}`);
                await IntelligentCache.deleteCache(`user_profile_edit_${offenderId.toString()}`);
                await IntelligentCache.deleteCache(`user_profile_full_${offenderId.toString()}`);
                console.log(`[캐시] 가해자(${offenderId}) 프로필 관련 캐시 삭제 완료`);
            } catch (cacheErr) {
                console.error('[캐시] 가해자 캐시 무효화 실패:', cacheErr.message);
            }
        }

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




