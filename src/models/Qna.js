import mongoose from 'mongoose';

const { Schema } = mongoose;

// 문의 스키마 정의
const qnaSchema = new Schema({
    qnatitle: {
        type: String,
        required: true,  // 문의 제목
        trim: true
    },
    qnacontents: {
        type: String,
        required: true,  // 문의 내용
    },
    qnaanswer: {
        type: String,
        default: null,  // 답변 내용, 기본값은 null
    },
    qnastatus: {
        type: String,
        required: true,
        enum: ['Pending', 'Answered'],  // 문의 상태: 'Pending'(답변 대기중), 'Answered'(답변 완료)
        default: 'Pending',  // 기본 상태는 'Pending'
    },
    userId: {
        type: Schema.Types.ObjectId,  // 실제 User 모델의 ObjectId 참조
        required: true,  // 문의를 작성한 유저 고유 ID
        ref: 'User',  // User 모델을 참조
    },
    answerUserId: {
        type: Schema.Types.ObjectId,  // 답변을 작성한 관리자(또는 유저) ID
        ref: 'User',  // User 모델을 참조
        default: null,  // 답변자가 없으면 null
    },
    qnaregdate: {
        type: Date,
        default: Date.now,  // 문의 등록 날짜, 기본값은 현재 날짜
    },
}, { timestamps: true });  // 생성일과 수정일 자동으로 기록

// 모델 생성
const Qna = mongoose.model('Qna', qnaSchema);

export default Qna;
