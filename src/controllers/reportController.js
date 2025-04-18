// 서비스 함수들을 불러옵니다.
import * as reportService from '../services/reportService.js';
import { Report } from '../models/report.js';
import PageRequestDTO from "../dto/common/PageRequestDTO.js";
import PageResponseDTO from "../dto/common/PageResponseDTO.js";
import {User} from "../models/UserProfile.js";

/**
 * 신고 생성 컨트롤러 함수
 * 클라이언트로부터 받은 요청 데이터를 이용하여 새로운 신고를 생성합니다.
 */
export const createReport = async (req, res) => {
    try {
        // 요청 본문(req.body)에서 데이터를 받아 서비스로 전달 후 생성된 신고 반환
        const newReport = await reportService.createReport(req.body);
        // 생성 성공 시 201 상태코드와 함께 결과 반환
        res.status(201).json(newReport);
    } catch (error) {
        // 에러 발생 시 500 상태코드와 에러 메시지 반환
        res.status(500).json({ error: error.message });
    }
};

/**
 * 단일 신고 조회 컨트롤러 함수
 * URL 파라미터의 id를 이용하여 해당 신고를 조회합니다.
 */
export const getReport = async (req, res) => {
    try {
        // URL에서 id 파라미터 추출하여 서비스 함수로 조회
        const report = await Report.findById(req.params.id);
        if (!report) {
            // 조회된 신고가 없으면 404 에러 반환
            return res.status(404).json({ message: 'Report not found' });
        }
        res.status(200).json(report);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * 여러 신고 조회 및 페이징 컨트롤러 함수
 */
export const getReports = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const size = parseInt(req.query.size) || 10;
        const pageRequestDTO = new PageRequestDTO(page, size);

        // 필터 객체 생성
        const filters = {};

        // 신고 구역 필터링: 허용된 값인지 확인 후 추가
        const allowedAreas = ['friendChat', 'randomChat', 'community'];
        if (req.query.reportArea && allowedAreas.includes(req.query.reportArea)) {
            filters.reportArea = req.query.reportArea;
        }

        // 신고 카테고리 필터링: 허용된 값인지 확인 후 추가
        const allowedCategories = [
            '욕설, 모욕, 혐오발언',
            '스팸, 도배, 거짓정보',
            '부적절한 메세지(성인/도박/마약 등)',
            '규칙에 위반되는 프로필/모욕성 닉네임'
        ];
        if (req.query.reportCategory && allowedCategories.includes(req.query.reportCategory)) {
            filters.reportCategory = req.query.reportCategory;
        }

        // 신고 상태 필터링: 허용된 상태인지 확인 후 추가
        const allowedStatuses = ['pending', 'reviewed', 'resolved', 'dismissed'];
        if (req.query.reportStatus && allowedStatuses.includes(req.query.reportStatus)) {
            filters.reportStatus = req.query.reportStatus;
        }
        // ===== 키워드 검색 추가 =====
        const { keyword, searchType = 'all' } = req.query;
        if (keyword) {
            const regex = new RegExp(keyword, 'i');
            let orConditions = [];
            switch (searchType) {
                case 'title':
                    orConditions = [{ reportTitle: { $regex: regex } }];
                    break;
                case 'content':
                    orConditions = [{ reportContants: { $regex: regex } }];
                    break;
                case 'admin':
                    orConditions = [{ adminNickname: { $regex: regex } }];
                    break;
                case 'offender':
                    orConditions = [{ offenderNickname: { $regex: regex } }];
                    break;
                case 'all':
                default: {
                    orConditions = [
                        { reportTitle:    { $regex: regex } },
                        { reportContants: { $regex: regex } },
                        { adminNickname:        { $regex: regex } },
                        { offenderNickname:     { $regex: regex } }
                    ];
                }
            }
            filters.$or = orConditions;
        }

        const { reports, totalCount } = await reportService.getReportsWithPagination(filters, page, size);
        const pageResponseDTO = new PageResponseDTO(reports, pageRequestDTO, totalCount);
        res.status(200).json(pageResponseDTO);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


/**
 * 신고 업데이트 컨트롤러 함수
 * URL 파라미터의 id와 요청 본문의 데이터를 이용하여 신고를 수정합니다.
 */
export const updateReport = async (req, res) => {
    try {
        // id와 body 데이터를 전달하여 신고 업데이트 후 결과 반환
        const updatedReport = await reportService.updateReport(req.params.id, req.body);
        if (!updatedReport) {
            // 업데이트된 신고가 없으면 404 에러 반환
            return res.status(404).json({ message: 'Report not found' });
        }
        res.status(200).json(updatedReport);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * 신고 삭제 컨트롤러 함수
 * URL 파라미터의 id를 이용하여 신고를 삭제합니다.
 */
export const deleteReport = async (req, res) => {
    try {
        // id를 이용하여 신고 삭제 후 결과 반환
        const deletedReport = await reportService.deleteReport(req.params.id);
        if (!deletedReport) {
            // 삭제된 신고가 없으면 404 에러 반환
            return res.status(404).json({ message: 'Report not found' });
        }
        res.status(200).json({ message: 'Report deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 신고에 대한 답변 추가 컨트롤러
export const replyToReport = async (req, res) => {
    try {
        const { reportAnswer, adminId, suspensionDays, stopDetail } = req.body;
        const updatedReport = await reportService.addReplyToReport(
            req.params.id,
            reportAnswer,
            adminId,
            suspensionDays,
            stopDetail
        );
        if (!updatedReport) {
            return res.status(404).json({ message: 'Report not found' });
        }
        res.status(200).json(updatedReport);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


