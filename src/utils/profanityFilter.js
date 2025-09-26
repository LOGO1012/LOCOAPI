// src/utils/profanityFilter.js
import fs from 'fs';
import path from 'path';

// 기본 비속어 목록 (폴백용)
const fallbackBadWords = [
  '개새끼', '씨발', '시발', '병신', '좆', '존나', '졸라',
  '개놈', '개년', '쌍년', '쌍놈', '지랄', '염병', '썅',
  '새끼', '바보', '멍청이', '미친'
];

// 최종적으로 사용될 비속어 목록과 정규식 (let으로 변경하여 동적 할당)
let badWords = [...fallbackBadWords];
let regex = new RegExp(`(${badWords.join('|')})`, 'gi');

// 로컬 파일 경로
const BAD_WORDS_FILE_PATH = path.join(process.cwd(), 'profanity.txt');

/**
 * 서버 시작 또는 필요 시 로컬 파일에서 비속어 목록을 불러와 업데이트합니다.
 */
export const reloadBadWords = () => {
  try {
    console.log(`[ProfanityFilter] 로컬 비속어 목록 파일을 다시 불러옵니다... (경로: ${BAD_WORDS_FILE_PATH})`);
    
    if (fs.existsSync(BAD_WORDS_FILE_PATH)) {
      const fileContent = fs.readFileSync(BAD_WORDS_FILE_PATH, 'utf8');
      const fetchedWords = fileContent.split(/\r?\n/).filter(word => word.trim() !== '');
      
      // 기존 목록과 합친 후 중복 제거
      const combinedWords = [...fallbackBadWords, ...fetchedWords];
      badWords = [...new Set(combinedWords)];

      // 정규식을 새로 생성
      regex = new RegExp(`(${badWords.join('|')})`, 'gi');
      
      console.log(`[ProfanityFilter] 목록 리로드 완료. 총 ${badWords.length}개의 단어가 필터링됩니다.`);
    } else {
      console.warn(`[ProfanityFilter] ${BAD_WORDS_FILE_PATH} 파일이 없어 기본 목록만 사용합니다.`);
      // 파일이 없으면 기본 목록으로 재설정
      badWords = [...fallbackBadWords];
      regex = new RegExp(`(${badWords.join('|')})`, 'gi');
    }
    return badWords;
  } catch (error) {
    console.error('[ProfanityFilter] 로컬 비속어 목록 파일을 불러오는 데 실패했습니다. 기본 목록만 사용합니다.', error.message);
    // 에러 발생 시 기본 목록으로 재설정
    badWords = [...fallbackBadWords];
    regex = new RegExp(`(${badWords.join('|')})`, 'gi');
    return badWords;
  }
};

// 서버 시작 시 비속어 목록 로드 실행
reloadBadWords();

/**
 * 욕설 및 비속어를 필터링하여 '*'로 대체합니다.
 * @param {string} text - 필터링할 원본 텍스트
 * @returns {string} - 필터링된 텍스트
 */
export const filterProfanity = (text) => {
  if (!text || typeof text !== 'string') {
    return '';
  }
  return text.replace(regex, (match) => '*'.repeat(match.length));
};

/**
 * 텍스트에 욕설이 포함되어 있는지 확인합니다.
 * @param {string} text - 검사할 텍스트
 * @returns {boolean} - 욕설 포함 여부 (true/false)
 */
export const containsProfanity = (text) => {
  if (!text || typeof text !== 'string') {
    return false;
  }
  // g 플래그가 있는 정규식을 재사용하기 위해 lastIndex를 초기화
  regex.lastIndex = 0;
  return regex.test(text);
};

export default filterProfanity;
