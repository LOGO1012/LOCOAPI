import mongoose from 'mongoose';

const uploadSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    filename: {
        type: String,
        required: true
    },
    url: {
        type: String,
        required: true
    },
    sourcePage: {              // 새로 추가
        type: String,
        required: false,         // 옵션으로 해도 되고, 필수로 해도 됩니다.
        default: null
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model('Upload', uploadSchema);
