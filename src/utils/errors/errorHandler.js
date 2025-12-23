/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🎯 에러 핸들러 유틸리티
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 목적:
 * - 일관된 에러 응답 형식 제공
 * - CustomError를 HTTP 응답으로 자동 변환
 * - 코드 중복 제거
 *
 * 사용법:
 * return sendErrorResponse(res, error);
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import {
    CustomError,
    InternalServerError,
    convertMongooseError
} from './CustomError.js';

/**
 * 에러를 HTTP 응답으로 변환하여 전송
 *
 * @param {Object} res - Express response 객체
 * @param {Error} error - 발생한 에러
 * @param {Object} options - 추가 옵션
 * @param {boolean} options.includeStack - 스택 트레이스 포함 여부 (개발 환경에서만)
 * @returns {Object} Express response
 *
 * @example
 * try {
 *   // ... 로직 ...
 * } catch (error) {
 *   return sendErrorResponse(res, error);
 * }
 */
export const sendErrorResponse = (res, error, options = {}) => {
    const { includeStack = process.env.NODE_ENV === 'development' } = options;

    // MongoDB 에러를 CustomError로 변환
    const convertedError = convertMongooseError(error);

    // CustomError인 경우
    if (convertedError instanceof CustomError) {
        const response = {
            success: false,
            statusCode: convertedError.statusCode,
            errorCode: convertedError.errorCode,
            message: convertedError.message
        };

        // 개발 환경에서만 스택 트레이스 포함
        if (includeStack) {
            response.stack = convertedError.stack;
        }

        return res.status(convertedError.statusCode).json(response);
    }

    // 기타 예상치 못한 에러
    console.error('❌ [Unexpected Error]', error);

    const internalError = new InternalServerError(
        process.env.NODE_ENV === 'development'
            ? error.message
            : '서버 오류가 발생했습니다.'
    );

    const response = {
        success: false,
        statusCode: 500,
        errorCode: 'INTERNAL_ERROR',
        message: internalError.message
    };

    // 개발 환경에서만 원본 에러 정보 포함
    if (includeStack) {
        response.originalError = error.message;
        response.stack = error.stack;
    }

    return res.status(500).json(response);
};

/**
 * 비동기 함수를 래핑하여 에러를 자동으로 처리
 *
 * @param {Function} fn - 비동기 함수
 * @returns {Function} 래핑된 함수
 *
 * @example
 * export const leaveChatRoom = asyncHandler(async (req, res) => {
 *   const { roomId, userId } = req.params;
 *   await leaveChatRoomService(roomId, userId);
 *   res.status(200).json({ success: true });
 * });
 */
export const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next))
            .catch((error) => {
                sendErrorResponse(res, error);
            });
    };
};

/**
 * Express 전역 에러 핸들러 미들웨어
 *
 * @param {Error} err - 발생한 에러
 * @param {Object} req - Express request 객체
 * @param {Object} res - Express response 객체
 * @param {Function} next - Express next 함수
 *
 * @example
 * // app.js에서 사용
 * import { globalErrorHandler } from './utils/errors/errorHandler.js';
 * app.use(globalErrorHandler);
 */
export const globalErrorHandler = (err, req, res, next) => {
    console.error('🚨 [Global Error Handler]', {
        url: req.originalUrl,
        method: req.method,
        error: err.message,
        stack: err.stack
    });

    return sendErrorResponse(res, err);
};

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 📋 Export 정리
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

export default {
    sendErrorResponse,
    asyncHandler,
    globalErrorHandler
};