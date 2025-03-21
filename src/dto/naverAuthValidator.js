// 파일 경로: src/dto/naverAuthValidator.js
// 네이버 소셜 로그인 요청에서 필요한 코드와 state 값을 검증하는 스키마입니다.
import Joi from 'joi';

export const naverAuthSchema = Joi.object({
    code: Joi.string()
        .required()
        .label('Authorization Code'),
    state: Joi.string()
        .required()
        .label('State')
});
