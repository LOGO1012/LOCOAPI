// QnaService.js
import { Qna } from '../models/Qna.js';

import PageResponseDTO from '../dto/common/PageResponseDTO.js';
import {User} from "../models/UserProfile.js";

const getQnaListPage = async (pageRequestDTO) => {
    try {
        const { page, size, qnaStatus, keyword, searchType } = pageRequestDTO;
        const skip = (page - 1) * size;

        // 기본 필터: 상태
        const filter = {};
        if (qnaStatus) {
            filter.qnaStatus = qnaStatus;
        }

        // 검색어가 있으면 옵션에 따라 분기
        if (keyword) {
            const regex = new RegExp(keyword, 'i');
            switch (searchType) {
                case 'title':
                    filter.qnaTitle = { $regex: regex };
                    break;
                case 'contents':
                    filter.qnaContents = { $regex: regex };
                    break;
                case 'both':
                    filter.$or = [
                        { qnaTitle:    { $regex: regex } },
                        { qnaContents: { $regex: regex } }
                    ];
                    break;
                case 'author': {
                    const authorIds = await User.find({ nickname: regex }).distinct('_id');
                    filter.userId = { $in: authorIds };
                    break;
                }
                case 'answerer': {
                    const answerIds = await User.find({ nickname: regex }).distinct('_id');
                    filter.answerUserId = { $in: answerIds };
                    break;
                }
                default:
                    // 'both' 기본 처리도 여기로 들어오므로 별도 처리 불필요
                    break;
            }
        }

        // 쿼리 실행
        const dtoList = await Qna.find(filter)
            .populate('userId')
            .populate('answerUserId')
            .skip(skip)
            .limit(size);

        const totalCount = await Qna.countDocuments(filter);

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
