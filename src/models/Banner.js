import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500
    },
    image: {
        filename: String,
        originalName: String,
        path: String,
        size: Number,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    },
    linkUrl: {
        type: String,
        trim: true,
        default: '' // 클릭 시 이동할 URL (선택사항)
    },
    isActive: {
        type: Boolean,
        default: true // 활성화 상태
    },
    order: {
        type: Number,
        default: 0 // 표시 순서 (낮을수록 먼저 표시)
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
    views: {
        type: Number,
        default: 0 // 클릭 횟수
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
bannerSchema.index({ isActive: 1, order: 1 });
bannerSchema.index({ createdAt: -1 });

export const Banner = mongoose.model('Banner', bannerSchema);
