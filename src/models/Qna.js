import mongoose from 'mongoose';
import { User }from './UserProfile.js';

const { Schema, model } = mongoose;

// 문의 스키마 정의
const qnaSchema = new Schema({
    qnaTitle: {
        type: String,
        required: true,  // 문의 제목
        trim: true
    },
    qnaContents: {
        type: String,
        required: true,  // 문의 내용
    },
    qnaAnswer: {
        type: String,
        default: null,  // 답변 내용, 기본값은 null
    },
    qnaStatus: {
        type: String,
        required: true,
        enum: ['답변대기', '답변완료'],  // 문의 상태: 'Pending'(답변 대기중), 'Answered'(답변 완료)
        default: '답변대기',  // 기본 상태는 'Pending'
    },
    userId: {
        type: Schema.Types.ObjectId,  // 실제 User 모델의 ObjectId 참조
        required: true,  // 문의를 작성한 유저 고유 ID
        ref: 'User',  // User 모델을 참조
    },
    userNickname: {
        type: String,
        default: '',
    },
    answerUserId: {
        type: Schema.Types.ObjectId,  // 답변을 작성한 관리자(또는 유저) ID
        ref: 'User',  // User 모델을 참조
        default: null,  // 답변자가 없으면 null
    },
    answerUserNickname: {
        type: String,
        default: '',
    },
    qnaRegdate: {
        type: Date,
        default: Date.now,  // 문의 등록 날짜, 기본값은 현재 날짜
    },
    isAnonymous: {
        type: Boolean,
        default: false, // false면 실명 표시, true면 익명
    },
    isAdminOnly: {
        type: Boolean,
        default: false, // false면 전체 공개, true면 관리자만 열람
    },
}, { timestamps: true });  // 생성일과 수정일 자동으로 기록


// 인덱스: qnaTitle, qnaContents, qnaAnswer, userId, answerUserId
qnaSchema.index({ qnaTitle: "text", qnaContents: "text", qnaAnswer: "text", userId: "text", answerUserId: "text" });



qnaSchema.index({ qnaTitle: 1 });
qnaSchema.index({ qnaContents: 1 });
qnaSchema.index({ userNickname: 1 });
qnaSchema.index({ answerNickname: 1 });

// 모델 생성
export const Qna = model('Qna', qnaSchema);


