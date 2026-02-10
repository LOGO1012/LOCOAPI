// QnaController.js
import QnaService from '../services/qnaService.js';
import PageRequestDTO from '../dto/common/PageRequestDTO.js';

/**
 * 페이지네이션 처리를 한 QnA 목록을 조회하여 클라이언트에 반환합니다.
 */
const getQnaListPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const size = parseInt(req.query.size) || 10;
        const qnaStatus = req.query.qnaStatus;
        const keyword = req.query.keyword;
        const searchType = req.query.searchType;
        const userId = req.query.userId;

        const pageRequestDTO = new PageRequestDTO(
            page, size, qnaStatus, keyword, searchType, userId);
        const pageResponseDTO = await QnaService.getQnaListPage(pageRequestDTO);
        return res.status(200).json(pageResponseDTO);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

/**
 * 새로운 QnA를 생성합니다. (로그인 사용자)
 */
const createQna = async (req, res) => {
    try {
        // 인증된 사용자 ID를 자동으로 설정
        const qnaData = {
            ...req.body,
            userId: req.user._id
        };
        const result = await QnaService.createQna(qnaData);
        return res.status(201).json(result);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

/**
 * 질문을 수정합니다. (작성자 본인만)
 */
const updateQna = async (req, res) => {
    try {
        const updatedQna = await QnaService.updateQna(
            req.params.id,
            req.body,
            req.user._id.toString()
        );
        if (!updatedQna) {
            return res.status(404).json({ message: 'QnA not found' });
        }
        return res.status(200).json(updatedQna);
    } catch (error) {
        if (error.message.includes('본인이 작성한') || error.message.includes('답변이 완료된')) {
            return res.status(403).json({ message: error.message });
        }
        return res.status(500).json({ error: error.message });
    }
};

/**
 * QnA에 답변을 추가합니다. (관리자 전용 - Lv≥3)
 */
const addAnswer = async (req, res) => {
    try {
        const { answer } = req.body;

        if (!answer || answer.trim() === '') {
            return res.status(400).json({ message: '답변 내용을 입력해주세요.' });
        }

        const updatedQna = await QnaService.addAnswer(
            req.params.id,
            answer,
            req.user._id
        );

        if (!updatedQna) {
            return res.status(404).json({ message: 'QnA not found' });
        }
        return res.status(200).json(updatedQna);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

/**
 * QnA를 삭제합니다. (작성자 본인 또는 관리자)
 */
const deleteQna = async (req, res) => {
    try {
        const deletedQna = await QnaService.deleteQna(
            req.params.id,
            req.user._id.toString(),
            req.user.userLv || 1
        );
        if (!deletedQna) {
            return res.status(404).json({ message: 'QnA not found' });
        }
        return res.status(200).json({ message: 'QnA deleted successfully' });
    } catch (error) {
        if (error.message.includes('삭제 권한')) {
            return res.status(403).json({ message: error.message });
        }
        return res.status(500).json({ error: error.message });
    }
};

export default {
    createQna,
    updateQna,
    addAnswer,
    deleteQna,
    getQnaListPage
};
