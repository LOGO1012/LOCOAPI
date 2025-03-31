// 서비스 함수들을 불러옵니다.
import * as reportService from '../services/reportService.js';
import { Report } from '../models/report.js';
import PageRequestDTO from "../dto/common/PageRequestDTO.js";
import PageResponseDTO from "../dto/common/PageResponseDTO.js";

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
        // 요청 쿼리에서 페이지 정보 추출 (기본값: page=1, size=10)
        const page = parseInt(req.query.page) || 1;
        const size = parseInt(req.query.size) || 10;
        const pageRequestDTO = new PageRequestDTO(page, size);

        // page, size를 제외한 나머지 필터 조건 추출 (필요시 확장)
        const { page: _page, size: _size, ...filters } = req.query;

        // 서비스 함수를 호출하여 페이징된 결과와 전체 개수 조회
        const { reports, totalCount } = await reportService.getReportsWithPagination(filters, page, size);

        // PageResponseDTO를 이용해 페이징 정보를 포함한 응답 생성
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
        const updatedReport = await reportService.addReplyToReport(req.params.id, req.body.reportAnswer);
        if (!updatedReport) {
            return res.status(404).json({ message: 'Report not found' });
        }
        res.status(200).json(updatedReport);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
