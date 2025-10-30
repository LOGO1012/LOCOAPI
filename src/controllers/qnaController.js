// QnaController.js
import QnaService from '../services/qnaService.js';
import PageRequestDTO from '../dto/common/PageRequestDTO.js';

/**
 * 페이지네이션 처리를 한 QnA 목록을 조회하여 클라이언트에 반환합니다.
 * 쿼리 파라미터로 page, size, qnaStatus를 전달합니다.
 * 예: /qnas?page=2&size=10&qnaStatus=답변대기
 */
const getQnaListPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const size = parseInt(req.query.size) || 10;
        const qnaStatus = req.query.qnaStatus;
        const keyword = req.query.keyword;
        const searchType = req.query.searchType;
        const userId = req.query.userId; // ◀◀◀ userId 파라미터 추가

        // PageRequestDTO에 qnaStatus와 keyword 필드를 함께 전달합니다.
        const pageRequestDTO = new PageRequestDTO(
            page, size, qnaStatus, keyword, searchType, userId);
        const pageResponseDTO = await QnaService.getQnaListPage(pageRequestDTO);
        return res.status(200).json(pageResponseDTO);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

/**
 * 새로운 QnA를 생성하고 클라이언트에 생성된 문서를 반환합니다.
 * @param {Object} req - 요청 객체 (req.body에 QnA 데이터가 있음)
 * @param {Object} res - 응답 객체
 */
const createQna = async (req, res) => {
    try {
        const result = await QnaService.createQna(req.body);
        return res.status(201).json(result);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

/**
 * 전체 QnA 목록을 조회하여 클라이언트에 반환합니다.
 * @param {Object} req - 요청 객체
 * @param {Object} res - 응답 객체
 */
const getAllQnas = async (req, res) => {
    try {
        const qnas = await QnaService.getAllQnas();
        return res.status(200).json(qnas);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

/**
 * 특정 ID에 해당하는 QnA 문서를 조회하여 클라이언트에 반환합니다.
 * 문서가 없으면 404 상태를 반환합니다.
 * @param {Object} req - 요청 객체 (req.params.id에 QnA ID가 있음)
 * @param {Object} res - 응답 객체
 */
// controllers/qnaController.js (예시: 단건 조회)
const getQnaById = async (req, res) => {
    try {
        const qna = await QnaService.getQnaById(req.params.id);
        if (!qna) return res.status(404).json({ message: 'QnA not found' });

        const user = req.user;
        const isAdmin = user && (user.role === 'admin' || user.userLv >= 2);
        const isOwner = user && user._id.toString() === qna.userId.toString();

        let serialized = {
            ...qna.toObject(),
            userNickname: qna.isAnonymous ? '익명' : qna.userNickname,
            qnaRegdate: qna.createdAt.toISOString(),
            updatedAt: qna.updatedAt.toISOString()
        };

        // 관리자가 아니고, 본인이 아닌 경우에만 비공개 처리
        if (qna.isAdminOnly && !isAdmin && !isOwner) {
            serialized.qnaTitle = '비공개 게시글입니다.';
            serialized.qnaContents = '비공개 게시글입니다. 관리자만 내용을 볼 수 있습니다.';
            serialized.qnaAnswer = qna.qnaAnswer ? '비공개 답변입니다.' : null;
        }

        return res.status(200).json(serialized);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};


/**
 * 특정 ID의 QnA 문서를 업데이트하고, 업데이트된 문서를 클라이언트에 반환합니다.
 * 문서가 없으면 404 상태를 반환합니다.
 * @param {Object} req - 요청 객체 (req.params.id에 QnA ID, req.body에 업데이트할 데이터가 있음)
 * @param {Object} res - 응답 객체
 */
const updateQna = async (req, res) => {
    try {
        const updatedQna = await QnaService.updateQna(req.params.id, req.body);
        if (!updatedQna) {
            return res.status(404).json({ message: 'QnA not found' });
        }
        return res.status(200).json(updatedQna);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

/**
 * 특정 ID의 QnA 문서를 삭제하고, 삭제 성공 메시지를 클라이언트에 반환합니다.
 * 문서가 없으면 404 상태를 반환합니다.
 * @param {Object} req - 요청 객체 (req.params.id에 QnA ID가 있음)
 * @param {Object} res - 응답 객체
 */
const deleteQna = async (req, res) => {
    try {
        const deletedQna = await QnaService.deleteQna(req.params.id);
        if (!deletedQna) {
            return res.status(404).json({ message: 'QnA not found' });
        }
        return res.status(200).json({ message: 'QnA deleted successfully' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

export default {
    createQna,
    getAllQnas,
    getQnaById,
    updateQna,
    deleteQna,
    getQnaListPage
};
