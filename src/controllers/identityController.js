// src/controllers/identityController.js
// 포트원 V2 본인인증 결과 조회 및 검증 컨트롤러
import axios from 'axios';
import { User } from '../models/UserProfile.js';
import ComprehensiveEncryption from '../utils/encryption/comprehensiveEncryption.js';

const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET;
const PORTONE_API_URL = 'https://api.portone.io';

/**
 * POST /api/identity/verify
 * 프론트에서 본인인증 완료 후 identityVerificationId를 받아
 * 포트원 API로 인증 결과를 조회하고 세션에 저장
 */
export const verifyIdentity = async (req, res) => {
    try {
        const { identityVerificationId } = req.body;

        if (!identityVerificationId) {
            return res.status(400).json({
                success: false,
                message: 'identityVerificationId가 필요합니다.',
                error: 'MISSING_VERIFICATION_ID'
            });
        }

        // H-16 보안 조치: 경로 탐색 방지를 위한 ID 형식 검증
        if (!/^[a-zA-Z0-9_-]+$/.test(identityVerificationId)) {
            return res.status(400).json({
                success: false,
                message: 'identityVerificationId 형식이 유효하지 않습니다.',
                error: 'INVALID_VERIFICATION_ID'
            });
        }

        // 포트원 API로 본인인증 결과 조회
        const response = await axios.get(
            `${PORTONE_API_URL}/identity-verifications/${identityVerificationId}`,
            {
                headers: {
                    Authorization: `PortOne ${PORTONE_API_SECRET}`
                }
            }
        );

        const verification = response.data;

        // 인증 상태 확인
        if (verification.status !== 'VERIFIED') {
            return res.status(400).json({
                success: false,
                message: '본인인증이 완료되지 않았습니다.',
                error: 'NOT_VERIFIED'
            });
        }

        const { ci, name, gender, birthDate, phoneNumber } = verification.verifiedCustomer;

        // CI 필수 체크 (카카오 인증 시 CI 미제공)
        if (!ci) {
            return res.status(400).json({
                success: false,
                message: '본인인증 정보가 부족합니다. 다른 인증 수단을 이용해주세요.',
                error: 'CI_NOT_PROVIDED'
            });
        }

        // CI 해시로 중복 가입 체크
        const ciHash = ComprehensiveEncryption.createSearchHash(ci);
        const existingUser = await User.findOne({ ci_hash: ciHash, status: 'active' });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: '이미 가입된 사용자입니다.',
                error: 'DUPLICATE_CI'
            });
        }

        // 만 14세 미만 가입 차단 (개인정보보호법 제22조, 정보통신망법 제31조)
        if (birthDate) {
            const today = new Date();
            const birth = new Date(birthDate);
            const eligibleDate = new Date(birth.getFullYear() + 14, birth.getMonth(), birth.getDate());

            if (today < eligibleDate) {
                const y = eligibleDate.getFullYear();
                const m = String(eligibleDate.getMonth() + 1).padStart(2, '0');
                const d = String(eligibleDate.getDate()).padStart(2, '0');

                console.log(`🚫 [본인인증] 만 14세 미만 가입 차단 - 생년월일: ${birthDate}`);

                return res.status(403).json({
                    success: false,
                    message: `만 14세 미만은 가입할 수 없습니다. ${y}년 ${m}월 ${d}일 이후 가입 가능합니다.`,
                    error: 'UNDER_AGE',
                    data: {
                        eligibleDate: `${y}-${m}-${d}`
                    }
                });
            }
        }

        // M-14 보안 조치: 세션에 민감 정보 암호화하여 저장 (CI, 실명, 전화번호, 생년월일)
        const [encryptedCi, encryptedName, encryptedPhone, encryptedBirth] = await Promise.all([
            ComprehensiveEncryption.encryptPersonalInfo(ci),
            name ? ComprehensiveEncryption.encryptPersonalInfo(name) : '',
            phoneNumber ? ComprehensiveEncryption.encryptPersonalInfo(phoneNumber) : '',
            birthDate ? ComprehensiveEncryption.encryptPersonalInfo(birthDate) : ''
        ]);

        req.session.identityVerification = {
            verified: true,
            ci: encryptedCi,
            ci_hash: ciHash,
            name: encryptedName,
            gender: gender || '',
            birthDate: encryptedBirth,
            phoneNumber: encryptedPhone,
            verifiedAt: new Date().toISOString(),
            identityVerificationId
        };

        console.log(`✅ [본인인증] 인증 성공 - CI해시: ${ciHash.substring(0, 10)}...`);

        // 프론트에는 마스킹된 값만 전달
        const maskedName = name ? name[0] + '*'.repeat(name.length - 2) + name[name.length - 1] : '';
        const maskedPhone = phoneNumber ? phoneNumber.replace(/(\d{3})(\d{4})(\d{4})/, '$1-****-$3') : '';

        return res.status(200).json({
            success: true,
            message: '본인인증이 완료되었습니다.',
            data: {
                name: maskedName,
                gender: gender || '',
                birthDate: birthDate ? birthDate.substring(0, 4) + '-**-**' : '',
                phoneNumber: maskedPhone
            }
        });

    } catch (error) {
        console.error('❌ [본인인증] 검증 실패:', error.response?.data || error.message);

        // 포트원 API 에러 처리
        if (error.response) {
            const status = error.response.status;
            if (status === 404) {
                return res.status(404).json({
                    success: false,
                    message: '본인인증 정보를 찾을 수 없습니다.',
                    error: 'VERIFICATION_NOT_FOUND'
                });
            }
            if (status === 401) {
                return res.status(500).json({
                    success: false,
                    message: '본인인증 서버 연동 오류가 발생했습니다.',
                    error: 'PORTONE_AUTH_ERROR'
                });
            }
        }

        return res.status(500).json({
            success: false,
            message: '본인인증 처리 중 오류가 발생했습니다.',
            error: 'VERIFICATION_ERROR'
        });
    }
};

/**
 * GET /api/identity/status
 * 현재 세션의 본인인증 상태 확인
 */
export const getIdentityStatus = async (req, res) => {
    try {
        const identity = req.session.identityVerification;

        if (!identity || !identity.verified) {
            return res.status(200).json({
                success: true,
                verified: false
            });
        }

        // M-14 보안 조치: 암호화된 세션 데이터 복호화 후 마스킹
        const [decryptedName, decryptedPhone, decryptedBirth] = await Promise.all([
            identity.name ? ComprehensiveEncryption.decryptPersonalInfo(identity.name) : '',
            identity.phoneNumber ? ComprehensiveEncryption.decryptPersonalInfo(identity.phoneNumber) : '',
            identity.birthDate ? ComprehensiveEncryption.decryptPersonalInfo(identity.birthDate) : ''
        ]);

        const maskedName = decryptedName
            ? decryptedName[0] + '*'.repeat(decryptedName.length - 2) + decryptedName[decryptedName.length - 1]
            : '';
        const maskedPhone = decryptedPhone
            ? decryptedPhone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-****-$3')
            : '';
        const maskedBirth = decryptedBirth
            ? decryptedBirth.substring(0, 4) + '-**-**'
            : '';

        return res.status(200).json({
            success: true,
            verified: true,
            data: {
                name: maskedName,
                gender: identity.gender,
                birthDate: maskedBirth,
                phoneNumber: maskedPhone,
                verifiedAt: identity.verifiedAt
            }
        });
    } catch (error) {
        console.error('❌ [본인인증] 상태 조회 실패:', error.message);
        return res.status(500).json({
            success: false,
            message: '본인인증 상태 조회 중 오류가 발생했습니다.'
        });
    }
};
