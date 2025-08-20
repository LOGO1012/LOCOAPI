import mongoose from 'mongoose';

const newsSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    content: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true,
        enum: ['공지사항', '이벤트'],
        default: '공지사항'
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    authorNickname: {
        type: String,
        required: true
    },
    images: [{
        filename: String,
        originalName: String,
        path: String,
        size: Number,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    isImportant: {
        type: Boolean,
        default: false // 중요 공지사항 여부
    },
    isActive: {
        type: Boolean,
        default: true // 게시 상태 (false일 경우 일반 사용자에게는 숨김, 관리자에게는 자물쇠 표시)
    },
    isDeleted: {
        type: Boolean,
        default: false // 삭제 상태 (true일 경우 완전히 숨김, DB에는 보존)
    },
    views: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// 인덱스 설정
newsSchema.index({ category: 1, createdAt: -1 });
newsSchema.index({ isImportant: -1, createdAt: -1 });
newsSchema.index({ isActive: 1 });
newsSchema.index({ isDeleted: 1 });

export const News = mongoose.model('News', newsSchema);
