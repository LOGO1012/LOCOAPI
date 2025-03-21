// src/controllers/userProfileController.js
import { User } from '../models/UserProfile.js'; // User 스키마(모델) 임포트
import { normalizePhoneNumber } from '../utils/normalizePhoneNumber.js';

/**
 * registerUserProfile
 * - 회원가입 폼과 URL 쿼리 또는 요청 본문으로 전달된 정보를 추출하여
 *   새로운 User 문서를 생성하고 DB에 저장합니다.
 * - 상위 필드(name, nickname, gender, phone, birthdate, info)와
 *   카카오 소셜 로그인 정보(social.kakao)를 통합하여 저장합니다.
 *
 * @param {import('express').Request} req - Express 요청 객체 (회원가입 정보 포함)
 * @param {import('express').Response} res - Express 응답 객체
 * @param {Function} next - 에러 핸들링 미들웨어 호출 함수
 * @returns {Promise} - 저장된 사용자 문서를 포함한 JSON 응답
 */
export const registerUserProfile = async (req, res, next) => {
    try {
        // 회원가입 폼 및 URL 쿼리에서 전달된 정보 추출
        // req.body 에는 카카오 정보와 추가 회원가입 정보가 모두 포함되어야 합니다.
        const { kakaoId, naverId, nickname, name, phoneNumber, birthdate, birthday, birthyear, kakaoGender, naverGender,   // 카카오에서 받은 성별
            formGender, info } = req.body;

        // 새 사용자 생성: 상위 필드와 카카오 소셜 로그인 정보를 통합합니다.
        // 스키마에 정의된 필수 필드(name, nickname, phone, birthdate)는 반드시 제공되어야 합니다.
        const newUser = new User({
            name,         // 회원가입 폼에서 입력한 실제 이름
            nickname,     // 회원가입 폼에서 입력한 닉네임
            gender: formGender,       // 회원가입 폼에서 선택한 성별 정보
            phone: normalizePhoneNumber(phoneNumber),       // 전화번호
            birthdate,    // 회원가입 폼에서 입력한 생년월일 (날짜 형식)
            info,         // 자기소개 등 추가 정보 (옵션)
            social: {
                // 카카오 소셜 로그인 정보 (kakaoId가 있을 때만 추가)
                ...(kakaoId && {
                    kakao: {
                        providerId: kakaoId,   // 카카오 고유 사용자 ID
                        name,                  // 카카오에서 받은 이름
                        phoneNumber,           // 카카오에서 받은 전화번호
                        birthday,              // 카카오에서 받은 생일 (MMDD 형식)
                        birthyear,             // 카카오에서 받은 출생년도
                        gender: kakaoGender    // 카카오에서 받은 성별 (예: "male" 또는 "female")
                    }
                }),
                // 네이버 소셜 로그인 정보 (naverId가 있을 때만 추가)
                ...(naverId && {
                    naver: {
                        providerId: naverId,   // 네이버 고유 사용자 ID
                        name,                  // 네이버에서 받은 이름
                        phoneNumber,           // 네이버에서 받은 전화번호 (예: mobile)
                        birthday,              // 네이버에서 받은 생일 ("MM-DD" 형식)
                        birthyear,             // 네이버에서 받은 출생년도
                        gender: naverGender    // 네이버에서 받은 성별 (예: "M" 또는 "F")
                    }
                })
            }
        });

        // 생성한 사용자 객체를 DB에 저장
        await newUser.save(); // DB 저장 성공 시 새 User 문서가 생성됩니다.
        console.log('신규 User 등록 성공:', newUser); // 저장 성공 로그 출력

        // 회원가입 성공 응답: 201 Created 상태와 함께 생성된 사용자 정보를 반환
        return res.status(201).json({
            message: '회원가입 성공',
            user: newUser
        });
    } catch (error) { // 오류헨들링코드
        // 에러 발생 시 콘솔에 오류 메시지를 출력하고, next()를 통해 에러를 미들웨어로 전달
        console.error('회원가입 컨트롤러 에러:', error.message);
        next(error);
    }
};
