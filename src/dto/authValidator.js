// src/dto/authValidator.js
import Joi from 'joi'; // Joi 라이브러리를 사용하여 입력값 검증

/**
 * kakaoAuthSchema
 * - 카카오 OAuth 콜백 요청에서 query 파라미터로 전달되는 'code' 값을 검증하는 스키마입니다.
 */
export const kakaoAuthSchema = Joi.object({
    code: Joi.string()            // 'code' 필드는 문자열이어야 하며,
        .required()                // 반드시 제공되어야 합니다.
        .label('Authorization Code') // 에러 메시지에서 사용할 라벨 이름
});

// (추가)(설명): 입력값 검증 결과를 콘솔에 출력하는 선택적 검증 함수
export const validateKakaoAuth = (data) => {
    const { error, value } = kakaoAuthSchema.validate(data);
    if (error) {
        console.error('DTO 검증 실패:', error.details[0].message); // 검증 실패 시 에러 메시지 출력
        return { valid: false, error: error.details[0].message };
    } else {
        console.log('DTO 검증 성공:', value); // 검증 성공 시 검증된 값 출력
        return { valid: true, value };
    }
};
