// 커스텀 에러 코드 관리(나중에 바꿀까 싶음 -> 형식정도만 미리 만듬)

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🎯 커스텀 에러 클래스 시스템
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 목적:
 * - HTTP 상태 코드와 에러 코드를 명확히 구분
 * - 일관된 에러 응답 구조 제공
 * - 프론트엔드에서 에러 타입을 쉽게 판단
 *
 * 사용법:
 * throw new NotFoundError('채팅방을 찾을 수 없습니다.');
 * throw new BadRequestError('잘못된 요청입니다.');
 * throw new ConflictError('이미 퇴장한 채팅방입니다.');
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

/**
 * 기본 커스텀 에러 클래스
 *
 * @class CustomError
 * @extends Error
 *
 * @property {string} message - 에러 메시지
 * @property {number} statusCode - HTTP 상태 코드
 * @property {string} errorCode - 에러 코드 (대문자_언더스코어 형식)
 * @property {string} name - 에러 클래스 이름
 */
export class CustomError extends Error {
    constructor(message, statusCode, errorCode) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.name = this.constructor.name;

        // 스택 트레이스 유지
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 4xx 클라이언트 에러 (재시도 불가)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

/**
 * 400 Bad Request - 잘못된 요청
 *
 * 사용 시점:
 * - 필수 파라미터 누락
 * - 잘못된 데이터 형식
 * - 유효성 검증 실패
 *
 * @example
 * throw new BadRequestError('사용자 ID가 필요합니다.');
 * throw new BadRequestError('잘못된 요청 형식입니다.');
 */
export class BadRequestError extends CustomError {
    constructor(message = '잘못된 요청입니다.') {
        super(message, 400, 'BAD_REQUEST');
    }
}

/**
 * 401 Unauthorized - 인증 필요
 *
 * 사용 시점:
 * - 로그인 필요
 * - 토큰 만료
 * - 인증 실패
 *
 * @example
 * throw new UnauthorizedError('로그인이 필요합니다.');
 * throw new UnauthorizedError('토큰이 만료되었습니다.');
 */
export class UnauthorizedError extends CustomError {
    constructor(message = '인증이 필요합니다.') {
        super(message, 401, 'UNAUTHORIZED');
    }
}

/**
 * 403 Forbidden - 권한 없음
 *
 * 사용 시점:
 * - 접근 권한 없음
 * - 차단된 사용자
 * - 관리자 전용 기능
 *
 * @example
 * throw new ForbiddenError('이 방에 접근할 권한이 없습니다.');
 * throw new ForbiddenError('차단된 사용자입니다.');
 */
export class ForbiddenError extends CustomError {
    constructor(message = '권한이 없습니다.') {
        super(message, 403, 'FORBIDDEN');
    }
}

/**
 * 404 Not Found - 리소스를 찾을 수 없음
 *
 * 사용 시점:
 * - 채팅방을 찾을 수 없음
 * - 사용자를 찾을 수 없음
 * - 메시지를 찾을 수 없음
 *
 * @example
 * throw new NotFoundError('채팅방을 찾을 수 없습니다.');
 * throw new NotFoundError('사용자를 찾을 수 없습니다.');
 */
export class NotFoundError extends CustomError {
    constructor(message = '리소스를 찾을 수 없습니다.') {
        super(message, 404, 'NOT_FOUND');
    }
}

/**
 * 409 Conflict - 충돌 (이미 존재하거나 상태 불일치)
 *
 * 사용 시점:
 * - 이미 퇴장한 방
 * - 중복 요청
 * - 상태 충돌
 *
 * @example
 * throw new ConflictError('이미 퇴장한 채팅방입니다.');
 * throw new ConflictError('이미 처리된 요청입니다.');
 */
export class ConflictError extends CustomError {
    constructor(message = '충돌이 발생했습니다.') {
        super(message, 409, 'CONFLICT');
    }
}

/**
 * 422 Unprocessable Entity - 처리할 수 없는 엔티티
 *
 * 사용 시점:
 * - 비즈니스 로직 위반
 * - 데이터 유효성 검증 실패
 *
 * @example
 * throw new UnprocessableEntityError('채팅방 정원이 초과되었습니다.');
 * throw new UnprocessableEntityError('이미 참가 중인 방입니다.');
 */
export class UnprocessableEntityError extends CustomError {
    constructor(message = '요청을 처리할 수 없습니다.') {
        super(message, 422, 'UNPROCESSABLE_ENTITY');
    }
}

/**
 * 429 Too Many Requests - 요청 과다
 *
 * 사용 시점:
 * - Rate Limiting
 * - API 호출 제한 초과
 *
 * @example
 * throw new TooManyRequestsError('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
 */
export class TooManyRequestsError extends CustomError {
    constructor(message = '요청이 너무 많습니다.') {
        super(message, 429, 'TOO_MANY_REQUESTS');
    }
}

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 5xx 서버 에러 (재시도 가능)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

/**
 * 500 Internal Server Error - 서버 내부 오류
 *
 * 사용 시점:
 * - 예상치 못한 오류
 * - 데이터베이스 오류
 * - 외부 API 오류
 *
 * @example
 * throw new InternalServerError('서버 오류가 발생했습니다.');
 * throw new InternalServerError('데이터베이스 연결에 실패했습니다.');
 */
export class InternalServerError extends CustomError {
    constructor(message = '서버 오류가 발생했습니다.') {
        super(message, 500, 'INTERNAL_ERROR');
    }
}

/**
 * 503 Service Unavailable - 서비스 이용 불가
 *
 * 사용 시점:
 * - 서버 점검 중
 * - 일시적 과부하
 * - 외부 서비스 장애
 *
 * @example
 * throw new ServiceUnavailableError('서비스 점검 중입니다.');
 * throw new ServiceUnavailableError('일시적으로 서비스를 이용할 수 없습니다.');
 */
export class ServiceUnavailableError extends CustomError {
    constructor(message = '서비스를 일시적으로 이용할 수 없습니다.') {
        super(message, 503, 'SERVICE_UNAVAILABLE');
    }
}

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🎯 leaveChatRoom 전용 커스텀 에러들
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

/**
 * 채팅방을 찾을 수 없음
 */
export class ChatRoomNotFoundError extends NotFoundError {
    constructor(roomId = null) {
        const message = roomId
            ? `채팅방을 찾을 수 없습니다. (ID: ${roomId})`
            : '채팅방을 찾을 수 없습니다.';
        super(message);
        this.errorCode = 'ROOM_NOT_FOUND';
    }
}

/**
 * 사용자를 찾을 수 없음
 */
export class UserNotFoundError extends NotFoundError {
    constructor(userId = null) {
        const message = userId
            ? `사용자를 찾을 수 없습니다. (ID: ${userId})`
            : '사용자를 찾을 수 없습니다.';
        super(message);
        this.errorCode = 'USER_NOT_FOUND';
    }
}

/**
 * 이미 퇴장한 채팅방
 */
export class AlreadyLeftRoomError extends ConflictError {
    constructor(roomId = null) {
        const message = roomId
            ? `이미 퇴장한 채팅방입니다. (ID: ${roomId})`
            : '이미 퇴장한 채팅방입니다.';
        super(message);
        this.errorCode = 'ALREADY_LEFT';
    }
}

/**
 * 잘못된 ObjectId 형식
 */
export class InvalidObjectIdError extends BadRequestError {
    constructor(fieldName = 'ID') {
        super(`잘못된 ${fieldName} 형식입니다.`);
        this.errorCode = 'INVALID_OBJECT_ID';
    }
}

/**
 * 채팅방 참여자가 아님
 */
export class NotARoomMemberError extends ForbiddenError {
    constructor() {
        super('이 채팅방의 참여자가 아닙니다.');
        this.errorCode = 'NOT_A_MEMBER';
    }
}

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🛠️ 유틸리티 함수
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

/**
 * 재시도 가능한 에러인지 판단
 *
 * @param {Error} error - 확인할 에러
 * @returns {boolean} 재시도 가능 여부
 */
export const isRetriableError = (error) => {
    // CustomError인 경우 statusCode로 판단
    if (error instanceof CustomError) {
        // 5xx 에러는 재시도 가능
        return error.statusCode >= 500 && error.statusCode < 600;
    }

    // HTTP 응답이 있는 경우
    if (error.response?.status) {
        const status = error.response.status;
        // 5xx 또는 429는 재시도 가능
        return status >= 500 || status === 429;
    }

    // 네트워크 오류는 재시도 가능
    if (error.message?.includes('Network') ||
        error.message?.includes('timeout') ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT') {
        return true;
    }

    return false;
};

/**
 * MongoDB CastError를 CustomError로 변환
 *
 * @param {Error} error - MongoDB 에러
 * @returns {CustomError} 변환된 커스텀 에러
 */
export const convertMongooseError = (error) => {
    if (error.name === 'CastError') {
        return new InvalidObjectIdError(error.path);
    }

    if (error.name === 'ValidationError') {
        return new BadRequestError('유효하지 않은 데이터입니다.');
    }

    if (error.code === 11000) {
        return new ConflictError('이미 존재하는 데이터입니다.');
    }

    return error;
};

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 📋 Export 정리
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

export default {
    // 기본 에러
    CustomError,

    // 4xx 에러
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    UnprocessableEntityError,
    TooManyRequestsError,

    // 5xx 에러
    InternalServerError,
    ServiceUnavailableError,

    // 도메인 특화 에러
    ChatRoomNotFoundError,
    UserNotFoundError,
    AlreadyLeftRoomError,
    InvalidObjectIdError,
    NotARoomMemberError,

    // 유틸리티
    isRetriableError,
    convertMongooseError
};