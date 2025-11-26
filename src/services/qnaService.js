// QnaService.js
import { Qna } from '../models/Qna.js';

import PageResponseDTO from '../dto/common/PageResponseDTO.js';
import {User} from "../models/UserProfile.js";

const getQnaListPage = async (pageRequestDTO) => {
    try {
        const { page, size, qnaStatus, keyword, searchType, userId } = pageRequestDTO; // ◀◀◀ userId 추출
        const skip = (page - 1) * size;

        // 기본 필터: 상태
        const filter = {};
        if (qnaStatus) {
            filter.qnaStatus = qnaStatus;
        }

        // ◀◀◀ userId가 있으면 필터에 추가
        if (userId) {
            filter.userId = userId;
        }

        // 검색어가 있으면 옵션에 따라 분기
        if (keyword && !userId) { // ◀◀◀ userId 필터링 시에는 키워드 검색 비활성화 (또는 필요에 따라 로직 수정)
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
                    filter.userNickname = { $regex: regex };
                    break;
                }
                case 'answerer': {
                    filter.answerUserNickname = { $regex: regex };
                    break;
                }
                default:
                    // 'both' 기본 처리도 여기로 들어오므로 별도 처리 불필요
                    break;
            }
        }

        // 쿼리 실행
        const dtoList = await Qna.find(filter)
            .select(
                'qnaTitle qnaContents qnaAnswer qnaStatus userNickname answerUserNickname isAnonymous isAdminOnly userId updatedAt createdAt'
            )
            .sort({ qnaStatus: 1, createdAt: -1 })
            .skip(skip)
            .limit(size)
            .lean();

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
        // 작성자 닉네임 스냅샷
        const author = await User.findById(qnaData.userId, 'nickname');
        await Qna.create({
            ...qnaData,
            userNickname: author?.nickname || '',
        });
        return { success: true, message: 'QnA가 성공적으로 생성되었습니다.' };
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
            // 답변자 닉네임 스냅샷
            if (updateData.answerUserId) {
                const answerer = await User.findById(updateData.answerUserId, 'nickname');
                updateData.answerUserNickname = answerer?.nickname || '';
            }
        }
        const updatedQna = await Qna.findByIdAndUpdate(id, updateData, { new: true });
        if (!updatedQna) return null;
        return {
            qnaAnswer: updatedQna.qnaAnswer,
            qnaStatus: updatedQna.qnaStatus
        };
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
    updateQna,
    deleteQna,
    getQnaListPage
};
