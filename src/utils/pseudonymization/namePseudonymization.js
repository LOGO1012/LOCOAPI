// src/utils/pseudonymization/namePseudonymization.js
// 성 제거 + 모음 변경 + 배치 섞기 가명처리

/**
 * 한글 자모 분해/조합을 위한 유틸리티
 */
const KoreanProcessor = {
    // 초성, 중성, 종성 분리
    decompose: (char) => {
        const code = char.charCodeAt(0);
        
        // 한글 완성형 범위 체크 (가-힣)
        if (code < 0xAC00 || code > 0xD7A3) {
            return null;
        }
        
        const baseCode = code - 0xAC00;
        const cho = Math.floor(baseCode / 588);      // 초성
        const jung = Math.floor((baseCode % 588) / 28); // 중성
        const jong = baseCode % 28;                  // 종성
        
        return { cho, jung, jong };
    },
    
    // 초성, 중성, 종성 결합
    compose: (cho, jung, jong) => {
        const code = cho * 588 + jung * 28 + jong + 0xAC00;
        return String.fromCharCode(code);
    },
    
    // 중성(모음) 변환 매핑
    vowelMapping: {
        0: 1,   // ㅏ → ㅑ
        4: 5,   // ㅓ → ㅕ
        8: 9,   // ㅗ → ㅛ
        13: 14, // ㅜ → ㅠ
        18: 19, // ㅡ → ㅢ
        20: 17, // ㅣ → ㅟ
        1: 2,   // ㅐ → ㅒ
        6: 7    // ㅔ → ㅖ
    }
};

/**
 * 성 제거 + 모음 변경 + 배치 섞기 가명처리 클래스
 */
export class NamePseudonymization {
    
    /**
     * 전화번호 마스킹 테스트 함수
     * @param {string} testPhone - 테스트할 전화번호
     * @returns {Object} - 테스트 결과
     */
    static testPhoneMasking(testPhone) {
        const result = {
            original: testPhone,
            masked: null,
            timestamp: new Date().toISOString()
        };
        
        try {
            result.masked = this.maskPhoneNumber(testPhone);
            result.success = true;
            
            // 마스킹 분석
            const originalLength = testPhone ? testPhone.replace(/[^0-9]/g, '').length : 0;
            const maskedVisibleDigits = result.masked ? result.masked.replace(/[^0-9]/g, '').length : 0;
            const hiddenDigits = originalLength - maskedVisibleDigits;
            
            result.analysis = {
                originalLength: originalLength,
                visibleDigits: maskedVisibleDigits,
                hiddenDigits: hiddenDigits,
                hiddenPercentage: originalLength > 0 ? Math.round((hiddenDigits / originalLength) * 100) : 0
            };
            
        } catch (error) {
            result.error = error.message;
            result.success = false;
        }
        
        return result;
    }

    /**
     * 전화번호 마스킹 처리 (개인정보 최소화)
     * @param {string} phoneNumber - 원본 전화번호 (예: "010-1234-5678")
     * @returns {string} - 마스킹 처리된 전화번호 (예: "***-****-5678")
     */
    static maskPhoneNumber(phoneNumber) {
        if (!phoneNumber || typeof phoneNumber !== 'string') {
            return '정보없음';
        }
        
        try {
            // 전화번호 정규화 (숫자만 추출)
            const numbersOnly = phoneNumber.replace(/[^0-9]/g, '');
            
            // 한국 전화번호 형식 처리
            if (numbersOnly.length === 11 && numbersOnly.startsWith('010')) {
                // 010-XXXX-XXXX 형식
                const last4 = numbersOnly.slice(-4);
                return `***-****-${last4}`;
            } else if (numbersOnly.length === 11) {
                // 기타 11자리
                const last4 = numbersOnly.slice(-4);
                return `***-****-${last4}`;
            } else if (numbersOnly.length === 10) {
                // 10자리 전화번호
                const last4 = numbersOnly.slice(-4);
                return `***-***-${last4}`;
            } else {
                // 기타 형식 - 마지막 4자리만 표시
                if (numbersOnly.length >= 4) {
                    const last4 = numbersOnly.slice(-4);
                    return `****-${last4}`;
                } else {
                    return '비정상마스킹';
                }
            }
            
        } catch (error) {
            console.error(`❌ 전화번호 마스킹 실패 (${phoneNumber}):`, error.message);
            return '처리실패';
        }
    }

    /**
     * 전체 가명처리 프로세스
     * @param {string} fullName - 원본 이름 (예: "김민수")
     * @param {string} userId - 사용자 ID (배치 섞기용 시드)
     * @returns {string} - 가명처리된 이름 (예: "슈민" 또는 "민슈")
     */
    static processName(fullName, userId) {
        if (!fullName || typeof fullName !== 'string' || fullName.length < 2) {
            return '정보없음';
        }
        
        try {
            console.log(`🎭 가명처리 시작: "${fullName}" (사용자: ${userId})`);
            
            // 1단계: 성 제거 (첫 글자 제거)
            const nameWithoutSurname = fullName.slice(1);
            console.log(`🔸 1단계 - 성 제거: "${fullName}" → "${nameWithoutSurname}"`);
            
            if (nameWithoutSurname.length < 1) {
                return '정보부족';
            }
            
            // 2단계: 2글자만 사용 (3글자 이름의 경우 앞 2글자)
            const twoCharName = nameWithoutSurname.slice(0, 2);
            console.log(`🔸 2단계 - 2글자 추출: "${nameWithoutSurname}" → "${twoCharName}"`);
            
            // 3단계: 모음 변경
            const vowelChanged = this.changeVowels(twoCharName);
            console.log(`🔸 3단계 - 모음 변경: "${twoCharName}" → "${vowelChanged}"`);
            
            // 4단계: 배치 섞기 (사용자별 고정 패턴)
            const shuffled = this.shuffleChars(vowelChanged, userId);
            console.log(`🔸 4단계 - 배치 섞기: "${vowelChanged}" → "${shuffled}"`);
            
            console.log(`✅ 가명처리 완료: "${fullName}" → "${shuffled}"`);
            return shuffled;
            
        } catch (error) {
            console.error(`❌ 가명처리 실패 (${fullName}):`, error.message);
            return '처리실패';
        }
    }
    
    /**
     * 모음 변경 처리
     * @param {string} name - 입력 이름
     * @returns {string} - 모음이 변경된 이름
     */
    static changeVowels(name) {
        return name.split('').map(char => {
            const decomposed = KoreanProcessor.decompose(char);
            
            // 한글이 아닌 경우 그대로 반환
            if (!decomposed) {
                return char;
            }
            
            const { cho, jung, jong } = decomposed;
            
            // 모음 변경 매핑 적용
            const newJung = KoreanProcessor.vowelMapping[jung] !== undefined ? 
                KoreanProcessor.vowelMapping[jung] : jung;
            
            // 변경된 모음으로 다시 조합
            return KoreanProcessor.compose(cho, newJung, jong);
            
        }).join('');
    }
    
    /**
     * 글자 배치 섞기 (사용자별 고정 패턴)
     * @param {string} name - 입력 이름
     * @param {string} userSeed - 사용자 고유 시드
     * @returns {string} - 배치가 섞인 이름
     */
    static shuffleChars(name, userSeed) {
        if (!name || name.length < 2) {
            return name;
        }
        
        const chars = name.split('');
        
        // 사용자 시드를 기반으로 고정된 패턴 생성
        const pattern = this.generateUserPattern(userSeed, chars.length);
        
        // 패턴에 따라 글자 재배열
        return pattern.map(index => chars[index]).join('');
    }
    
    /**
     * 사용자별 고정 섞기 패턴 생성
     * @param {string} userSeed - 사용자 고유 시드
     * @param {number} length - 이름 길이
     * @returns {Array<number>} - 섞기 패턴 배열
     */
    static generateUserPattern(userSeed, length) {
        // 사용자 ID를 숫자로 변환 (간단한 해시)
        let hash = 0;
        for (let i = 0; i < userSeed.length; i++) {
            const char = userSeed.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit 정수로 변환
        }
        
        // 절댓값으로 변환
        hash = Math.abs(hash);
        
        // 길이별 섞기 패턴 정의
        const patterns = {
            1: [[0]],                          // 1글자: 변화 없음
            2: [[0, 1], [1, 0]],              // 2글자: 2가지 패턴
            3: [[0, 1, 2], [2, 0, 1], [1, 2, 0]], // 3글자: 3가지 패턴
            4: [[0, 1, 2, 3], [3, 0, 2, 1], [1, 3, 0, 2], [2, 1, 3, 0]] // 4글자: 4가지 패턴
        };
        
        const availablePatterns = patterns[length] || [[...Array(length).keys()]];
        const selectedPattern = availablePatterns[hash % availablePatterns.length];
        
        console.log(`🔀 사용자 ${userSeed} (${length}글자) 패턴: [${selectedPattern.join(', ')}]`);
        
        return selectedPattern;
    }
    
    /**
     * 나이를 세분화된 연령대로 변환
     * @param {number} age - 나이
     * @returns {string} - 연령대 (예: "20대 초반", "30대 중반")
     */
    static getDetailedAgeGroup(age) {
        if (!age || age < 0 || age > 120) return '정보없음';
        
        // 미성년자 구분
        if (age < 10) return '유아';
        if (age >= 10 && age <= 13) return '10대 초반';
        if (age >= 14 && age <= 16) return '10대 중반';
        if (age >= 17 && age <= 19) return '10대 후반';
        
        // 성인 연령대 세분화
        const decade = Math.floor(age / 10) * 10; // 20, 30, 40, ...
        const ageInDecade = age - decade;
        
        let subGroup;
        if (ageInDecade <= 3) {
            subGroup = '초반';
        } else if (ageInDecade <= 6) {
            subGroup = '중반';
        } else {
            subGroup = '후반';
        }
        
        // 60세 이상은 단순화
        if (age >= 60) {
            return age >= 70 ? '70세 이상' : '60대';
        }
        
        return `${decade}대 ${subGroup}`;
    }
    
    /**
     * 미성년자 여부 판단
     * @param {number} age - 나이
     * @returns {boolean|null} - 미성년자 여부
     */
    static isMinor(age) {
        if (!age || age < 0) return null;
        return age < 19; // 한국 기준 만 19세 미만
    }
    
    /**
     * 성인 콘텐츠 접근 가능 여부
     * @param {number} age - 나이
     * @returns {boolean|null} - 접근 가능 여부
     */
    static canAccessAdultContent(age) {
        if (!age || age < 0) return null;
        return age >= 19; // 한국 기준 만 19세 이상
    }
    
    /**
     * 테스트 함수 - 가명처리 검증용
     * @param {string} name - 테스트할 이름
     * @param {string} userId - 사용자 ID
     * @returns {Object} - 테스트 결과
     */
    static testPseudonymization(name, userId) {
        const result = {
            original: name,
            userId: userId,
            steps: {},
            final: null,
            timestamp: new Date().toISOString()
        };
        
        try {
            // 각 단계별 처리 결과 기록
            const nameWithoutSurname = name.slice(1);
            result.steps.step1_removeSurname = nameWithoutSurname;
            
            const twoCharName = nameWithoutSurname.slice(0, 2);
            result.steps.step2_twoChars = twoCharName;
            
            const vowelChanged = this.changeVowels(twoCharName);
            result.steps.step3_vowelChange = vowelChanged;
            
            const shuffled = this.shuffleChars(vowelChanged, userId);
            result.steps.step4_shuffle = shuffled;
            
            result.final = shuffled;
            result.success = true;
            
        } catch (error) {
            result.error = error.message;
            result.success = false;
        }
        
        return result;
    }
}

export default NamePseudonymization;