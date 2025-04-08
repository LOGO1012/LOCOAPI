// QnaService.js
import { Qna } from '../models/Qna.js';

import PageResponseDTO from '../dto/common/PageResponseDTO.js';

const getQnaListPage = async (pageRequestDTO) => {
    try {
        const page = pageRequestDTO.page;
        const size = pageRequestDTO.size;
        const skip = (page - 1) * size;
        // qnaStatus가 전달된 경우 필터 조건에 추가합니다.
        let filter = {};
        if (pageRequestDTO.qnaStatus) {
            filter.qnaStatus = pageRequestDTO.qnaStatus;
        }

        // 조건에 맞는 QnA 데이터 조회 (populate 옵션 포함)
        const dtoList = await Qna.find(filter)
            .populate('userId')
            .populate('answerUserId')
            .skip(skip)
            .limit(size);

        // 조건에 맞는 전체 QnA 문서 수 조회
        const totalCount = await Qna.countDocuments(filter);

        // PageResponseDTO를 생성하여 반환
        return new PageResponseDTO(dtoList, pageRequestDTO, totalCount);
    } catch (error) {
        throw new Error(error);
    }
};
/**
 * 새로운 QnA 문서를 생성합니다.
 * @param {Object} qnaData - QnA 생성에 필요한 데이터 (qnaTitle, qnaContents, userId 등)
 * @returns {Promise<Object>} 생성된 QnA 문서
 */
const createQna = async (qnaData) => {
    try {
        const newQna = await Qna.create(qnaData);
        return newQna;
    } catch (error) {
        throw new Error(error);
    }
};

/**
 * 전체 QnA 문서 목록을 조회합니다.
 * 사용자 및 답변 작성자 정보를 populate 하여 반환합니다.
 * @returns {Promise<Array>} QnA 문서 목록
 */
const getAllQnas = async () => {
    try {
        const qnas = await Qna.find()
            .populate('userId')
            .populate('answerUserId');
        return qnas;
    } catch (error) {
        throw new Error(error);
    }
};

/**
 * 주어진 ID에 해당하는 QnA 문서를 조회합니다.
 * 사용자 및 답변 작성자 정보를 populate 하여 반환합니다.
 * @param {String} id - QnA 문서의 ID
 * @returns {Promise<Object>} 조회된 QnA 문서
 */
const getQnaById = async (id) => {
    try {
        const qna = await Qna.findById(id)
            .populate('userId')
            .populate('answerUserId');
        return qna;
    } catch (error) {
        throw new Error(error);
    }
};

/**
 * 주어진 ID의 QnA 문서를 업데이트합니다.
 * 답변이 추가되면 qnaStatus를 'Answered'로 변경합니다.
 * @param {String} id - 업데이트할 QnA 문서의 ID
 * @param {Object} updateData - 업데이트할 데이터
 * @returns {Promise<Object>} 업데이트된 QnA 문서
 */
const updateQna = async (id, updateData) => {
    try {
        // 답변 내용이 있다면 상태를 'Answered'로 설정
        if (updateData.qnaAnswer) {
            updateData.qnaStatus = '답변완료';
        }
        const updatedQna = await Qna.findByIdAndUpdate(id, updateData, { new: true });
        return updatedQna;
    } catch (error) {
        throw new Error(error);
    }
};

/**
 * 주어진 ID의 QnA 문서를 삭제합니다.
 * @param {String} id - 삭제할 QnA 문서의 ID
 * @returns {Promise<Object>} 삭제된 QnA 문서
 */
const deleteQna = async (id) => {
    try {
        const deletedQna = await Qna.findByIdAndDelete(id);
        return deletedQna;
    } catch (error) {
        throw new Error(error);
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
