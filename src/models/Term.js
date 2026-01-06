import mongoose from 'mongoose';

const termSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['TERMS', 'PRIVACY', 'MARKETING'],
        required: true
    },
    version: {
        type: String,
        required: true
    },
    content: {
        type: String, // HTML or Markdown content
        required: true
    },
    isRequired: {
        type: Boolean,
        default: true
    },
    effectiveDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// 동일 타입, 동일 버전 중복 방지
termSchema.index({ type: 1, version: 1 }, { unique: true });

const Term = mongoose.model('Term', termSchema);

export default Term;
