import mongoose from 'mongoose';

const termConsentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    termId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Term',
        required: true
    },
    hasAgreed: {
        type: Boolean,
        default: true,
        required: true
    },
    agreedAt: {
        type: Date,
        default: Date.now
    },
    ipAddress: {
        type: String,
        required: true
    }
});

// 유저는 하나의 약관 버전에 대해 한 번만 동의 레코드를 가짐
termConsentSchema.index({ userId: 1, termId: 1 }, { unique: true });

const TermConsent = mongoose.model('TermConsent', termConsentSchema);

export default TermConsent;
