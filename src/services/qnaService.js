// QnaService.js
import { Qna } from '../models/Qna.js';
import { QnaHistory } from '../models/QnaHistory.js';

import PageResponseDTO from '../dto/common/PageResponseDTO.js';
import {User} from "../models/UserProfile.js";

const getQnaListPage = async (pageRequestDTO) => {
    try {
        const { page, size, qnaStatus, keyword, searchType, userId } = pageRequestDTO;
        const skip = (page - 1) * size;

        // 기본 필터: 상태
        const filter = {};
        if (qnaStatus) {
            filter.qnaStatus = qnaStatus;
        }

        // userId가 있으면 필터에 추가
        if (userId) {
            filter.userId = userId;
        }

        // 검색어가 있으면 옵션에 따라 분기
        if (keyword && !userId) {
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
                    const users = await User.find({ nickname: { $regex: regex } }).select('_id');
                    filter.userId = { $in: users.map(u => u._id) };
                    break;
                }
                case 'answerer': {
                    const users = await User.find({ nickname: { $regex: regex } }).select('_id');
                    filter.answerUserId = { $in: users.map(u => u._id) };
                    break;
                }
                default:
                    break;
            }
        }

        // 쿼리 실행
        const dtoList = await Qna.find(filter)
            .select(
                'qnaTitle qnaContents qnaAnswer qnaStatus isAnonymous isAdminOnly userId answerUserId updatedAt createdAt'
            )
            .populate('userId', 'nickname')
            .populate('answerUserId', 'nickname')
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
        await Qna.create(qnaData);
        return { success: true, message: 'QnA가 성공적으로 생성되었습니다.' };
    } catch (error) {
        throw new Error(error);
    }
};

/**
 * 주어진 ID의 QnA 질문을 수정합니다. (작성자 본인만 가능)
 * @param {String} id - 업데이트할 QnA 문서의 ID
 * @param {Object} updateData - 업데이트할 데이터 (qnaTitle, qnaContents만 허용)
 * @param {String} requestUserId - 요청한 사용자 ID
 * @returns {Promise<Object>} 업데이트된 QnA 문서
 */
const updateQna = async (id, updateData, requestUserId) => {
    try {
        // 기존 데이터 조회
        const currentQna = await Qna.findById(id);
        if (!currentQna) return null;

        // 작성자 본인 확인
        if (currentQna.userId.toString() !== requestUserId) {
            throw new Error('본인이 작성한 질문만 수정할 수 있습니다.');
        }

        // 답변이 이미 완료된 경우 수정 불가
        if (currentQna.qnaStatus === '답변완료') {
            throw new Error('답변이 완료된 질문은 수정할 수 없습니다.');
        }

        // 질문 관련 필드만 추출 (답변 필드는 제외)
        const allowedFields = ['qnaTitle', 'qnaContents', 'isAnonymous', 'isAdminOnly'];
        const filteredData = {};
        for (const key of allowedFields) {
            if (updateData[key] !== undefined) {
                filteredData[key] = updateData[key];
            }
        }

        // 제목이나 내용이 수정될 경우 히스토리에 기록
        if (filteredData.qnaTitle || filteredData.qnaContents) {
            await QnaHistory.create({
                qnaId: currentQna._id,
                title: currentQna.qnaTitle,
                contents: currentQna.qnaContents
            });
        }

        const updatedQna = await Qna.findByIdAndUpdate(id, filteredData, { new: true })
            .populate('userId', 'nickname')
            .populate('answerUserId', 'nickname');

        return updatedQna;
    } catch (error) {
        throw error;
    }
};

/**
 * QnA에 답변을 추가합니다. (관리자 전용)
 * @param {String} id - QnA 문서의 ID
 * @param {String} answer - 답변 내용
 * @param {String} adminUserId - 답변을 작성하는 관리자 ID
 * @returns {Promise<Object>} 업데이트된 QnA 문서
 */
const addAnswer = async (id, answer, adminUserId) => {
    try {
        const currentQna = await Qna.findById(id);
        if (!currentQna) return null;

        const updateData = {
            qnaAnswer: answer,
            qnaStatus: '답변완료',
            answerUserId: adminUserId
        };

        const updatedQna = await Qna.findByIdAndUpdate(id, updateData, { new: true })
            .populate('userId', 'nickname')
            .populate('answerUserId', 'nickname');

        return updatedQna;
    } catch (error) {
        throw new Error(error);
    }
};

/**
 * 주어진 ID의 QnA 문서를 삭제합니다. (작성자 본인 또는 관리자)
 * @param {String} id - 삭제할 QnA 문서의 ID
 * @param {String} requestUserId - 요청한 사용자 ID
 * @param {Number} userLevel - 요청한 사용자 레벨
 * @returns {Promise<Object>} 삭제된 QnA 문서
 */
const deleteQna = async (id, requestUserId, userLevel) => {
    try {
        const currentQna = await Qna.findById(id);
        if (!currentQna) return null;

        // 작성자 본인이거나 관리자(Lv≥3)인 경우만 삭제 가능
        const isOwner = currentQna.userId.toString() === requestUserId;
        const isAdmin = userLevel >= 3;

        if (!isOwner && !isAdmin) {
            throw new Error('삭제 권한이 없습니다.');
        }

        const deletedQna = await Qna.findByIdAndDelete(id);
        return deletedQna;
    } catch (error) {
        throw error;
    }
};

export default {
    createQna,
    updateQna,
    addAnswer,
    deleteQna,
    getQnaListPage
};
