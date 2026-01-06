import Term from '../models/Term.js';
import TermConsent from '../models/TermConsent.js';
import mongoose from 'mongoose';

// === Admin: 약관 관리 ===

// 약관 생성 (새 버전)
export const createTerm = async (req, res) => {
    try {
        const { type, version, content, effectiveDate, isRequired } = req.body;

        // 이미 존재하는 버전인지 확인
        const existing = await Term.findOne({ type, version });
        if (existing) {
            return res.status(400).json({ success: false, message: '이미 존재하는 약관 버전입니다.' });
        }

        const newTerm = new Term({
            type,
            version,
            content,
            effectiveDate: effectiveDate || new Date(),
            isRequired: isRequired !== undefined ? isRequired : true
        });

        await newTerm.save();
        res.status(201).json({ success: true, data: newTerm });
    } catch (error) {
        console.error('Create Term Error:', error);
        res.status(500).json({ success: false, message: '약관 생성 실패', error: error.message });
    }
};

// 약관 목록 조회 (관리자용 - 전체 히스토리)
export const getAllTerms = async (req, res) => {
    try {
        const terms = await Term.find().sort({ type: 1, version: -1 }); // 타입별, 최신버전순
        res.status(200).json({ success: true, data: terms });
    } catch (error) {
        res.status(500).json({ success: false, message: '약관 조회 실패', error: error.message });
    }
};

// 특정 약관 상세 조회
export const getTermById = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: '유효하지 않은 약관 ID입니다.' });
        }
        const term = await Term.findById(req.params.id);
        if (!term) return res.status(404).json({ success: false, message: '약관을 찾을 수 없습니다.' });
        res.status(200).json({ success: true, data: term });
    } catch (error) {
        res.status(500).json({ success: false, message: '약관 상세 조회 실패', error: error.message });
    }
};

// 약관 삭제
export const deleteTerm = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: '유효하지 않은 약관 ID입니다.' });
        }

        // 1. 약관 존재 확인
        const term = await Term.findById(id);
        if (!term) {
            return res.status(404).json({ success: false, message: '약관을 찾을 수 없습니다.' });
        }

        // 2. 동의 기록 삭제 (선택 사항: 기록을 남겨두려면 이 단계 생략하거나, soft delete 사용)
        // 여기서는 깔끔한 삭제를 위해 관련 동의 기록도 모두 삭제합니다.
        await TermConsent.deleteMany({ termId: id });

        // 3. 약관 삭제
        await Term.findByIdAndDelete(id);

        res.status(200).json({ success: true, message: '약관 및 관련 동의 기록이 삭제되었습니다.' });
    } catch (error) {
        console.error('Delete Term Error:', error);
        res.status(500).json({ success: false, message: '약관 삭제 실패', error: error.message });
    }
};

// 약관 수정
export const updateTerm = async (req, res) => {
    try {
        const { id } = req.params;
        const { type, version, content, effectiveDate, isRequired } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: '유효하지 않은 약관 ID입니다.' });
        }

        // 중복 체크 (자신 제외하고 type, version이 같은게 있는지)
        const duplicate = await Term.findOne({
            type,
            version,
            _id: { $ne: id }
        });

        if (duplicate) {
            return res.status(400).json({ success: false, message: '이미 존재하는 약관 종류 및 버전입니다.' });
        }

        const updatedTerm = await Term.findByIdAndUpdate(
            id,
            {
                type,
                version,
                content,
                effectiveDate,
                isRequired
            },
            { new: true } // 업데이트된 문서 반환
        );

        if (!updatedTerm) {
            return res.status(404).json({ success: false, message: '약관을 찾을 수 없습니다.' });
        }

        res.status(200).json({ success: true, data: updatedTerm });
    } catch (error) {
        console.error('Update Term Error:', error);
        res.status(500).json({ success: false, message: '약관 수정 실패', error: error.message });
    }
};

// === User: 동의 및 조회 ===

// 현재 유효한 최신 약관들 조회 (각 타입별 최신 버전 1개씩)
export const getActiveTerms = async (req, res) => {
    try {
        const now = new Date();
        // 각 타입별로 effectiveDate가 현재보다 과거인 것 중 가장 최신 버전을 가져옴
        const types = ['TERMS', 'PRIVACY', 'MARKETING'];
        const activeTerms = [];

        for (const type of types) {
            const term = await Term.findOne({
                type,
                effectiveDate: { $lte: now }
            }).sort({ effectiveDate: -1, version: -1 });
            
            if (term) activeTerms.push(term);
        }

        res.status(200).json({ success: true, data: activeTerms });
    } catch (error) {
        res.status(500).json({ success: false, message: '유효 약관 조회 실패', error: error.message });
    }
};

// 로그인한 유저의 미동의 필수/선택 약관 조회 (의사 표시 안 한 것들)
export const getMissingConsents = async (req, res) => {
    try {
        const userId = req.user._id;
        const now = new Date();

        // 1. 현재 유효한 모든 약관 목록 조회 (필수/선택 모두)
        const types = ['TERMS', 'PRIVACY', 'MARKETING'];
        const activeTerms = [];

        for (const type of types) {
            const term = await Term.findOne({
                type,
                effectiveDate: { $lte: now }
            }).sort({ effectiveDate: -1, version: -1 });
            
            if (term) activeTerms.push(term);
        }

        // 2. 유저가 이미 의사 표시(동의 or 거절)한 내역 조회
        const userConsents = await TermConsent.find({ userId });
        const processedTermIds = userConsents.map(c => c.termId.toString());

        // 3. 기록이 없는 약관 필터링 (새로운 약관 or 미동의 약관)
        const missingTerms = activeTerms.filter(term => !processedTermIds.includes(term._id.toString()));

        res.status(200).json({ success: true, data: missingTerms });
    } catch (error) {
        console.error('Check Consent Error:', error);
        res.status(500).json({ success: false, message: '동의 확인 실패', error: error.message });
    }
};

// 약관 동의/거절 제출
export const submitConsent = async (req, res) => {
    try {
        const userId = req.user._id;
        const { consents } = req.body; // [{ termId: "...", agreed: true }, ...]
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

        if (!consents || !Array.isArray(consents) || consents.length === 0) {
            return res.status(400).json({ success: false, message: '처리할 약관이 없습니다.' });
        }

        const results = [];
        for (const item of consents) {
            const { termId, agreed } = item;

            // 이미 기록이 있는지 확인
            const existing = await TermConsent.findOne({ userId, termId });
            if (!existing) {
                const consent = new TermConsent({
                    userId,
                    termId,
                    hasAgreed: agreed, // 동의 여부 저장
                    ipAddress
                });
                await consent.save();
                results.push(consent);
            }
        }

        res.status(200).json({ success: true, message: '약관 동의 내역이 저장되었습니다.', data: results });
    } catch (error) {
        console.error('Submit Consent Error:', error);
        res.status(500).json({ success: false, message: '약관 처리 실패', error: error.message });
    }
};
