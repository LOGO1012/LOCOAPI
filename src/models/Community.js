import mongoose from 'mongoose';

const { Schema } = mongoose;

// 댓글 스키마 정의 (게시물의 하위 문서로 사용)
const commentSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,  // 댓글 작성자 ID
        trim: true
    },
    commentContents: {
        type: String,
        required: true,  // 댓글 내용
    },
    commentRegDate: {
        type: Date,
        default: Date.now,  // 댓글 등록 날짜는 기본값으로 현재 날짜
    },
}, { timestamps: true });  // 댓글 생성, 수정 날짜 자동 추가

// 게시물 스키마 정의
const communitySchema = new Schema({
    //게시글 작성자
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        trim: true  // 유저 정보와 연동
    },
    //게시글 제목
    communityTitle: {
        type: String,
        required: true,
        trim: true
    },
    //게시글 내용
    communityContents: {
        type: String,
        required: true
    },
    //카테고리
    communityCategory: {
        type: String,
        required: true,
        enum: ['자유', '유머', '질문', '사건사고', '전적인증'], // 카테고리 종류
    },
    //게시글 등록 날짜
    communityRegDate: {
        type: Date,
        default: Date.now,  // 게시물 등록 날짜는 기본값으로 현재 날짜
    },
    //게시글 이미지
    communityImage: {
        type: String,  // 이미지 URL을 저장
        default: null
    },
    //게시글 추천 따봉
    recommended: {
        type: Number,
        default: 0  // 추천 수
    },
    comments: [commentSchema],  // 댓글 필드 (배열로 댓글들 저장)
    commentCount: {
        type: Number,
        default: 0  // 댓글 수
    },
}, { timestamps: true });


// 모델 생성
const Community = mongoose.model('Community', communitySchema);

export default Community;
