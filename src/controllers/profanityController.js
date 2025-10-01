// LOCOAPI/src/controllers/profanityController.js
import fs from 'fs';
import path from 'path';
import { reloadBadWords } from '../utils/profanityFilter.js';

const BAD_WORDS_FILE_PATH = path.join(process.cwd(), 'profanity.txt');

// 현재 비속어 목록 조회 (페이징 추가)
export const getWords = (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50; // 한 페이지에 50개씩 표시
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;

        const allWords = reloadBadWords(); // 파일을 다시 읽어 최신 목록을 가져옴
        const paginatedWords = allWords.slice(startIndex, endIndex);
        
        res.status(200).json({
            success: true,
            words: paginatedWords,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(allWords.length / limit),
                totalWords: allWords.length
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: '목록을 불러오는 데 실패했습니다.', error: error.message });
    }
};

// 새로운 비속어 추가
export const addWord = (req, res) => {
    try {
        const { word } = req.body;
        if (!word || typeof word !== 'string' || word.trim().length === 0) {
            return res.status(400).json({ success: false, message: '유효한 단어를 입력해주세요.' });
        }

        const newWord = word.trim();
        // 파일에 단어 추가 (이미 존재하면 추가하지 않음)
        const fileContent = fs.readFileSync(BAD_WORDS_FILE_PATH, 'utf8');
        const words = fileContent.split(/\r?\n/);
        if (!words.includes(newWord)) {
            fs.appendFileSync(BAD_WORDS_FILE_PATH, `
${newWord}`);
        }

        const updatedWords = reloadBadWords(); // 필터 재로드
        res.status(201).json({ success: true, message: `'${newWord}' 단어가 추가되었습니다.`, words: updatedWords });

    } catch (error) {
        res.status(500).json({ success: false, message: '단어 추가에 실패했습니다.', error: error.message });
    }
};

// 비속어 삭제
export const deleteWord = (req, res) => {
    try {
        const { word } = req.body; // 프론트엔드에서 body로 보내는 것을 가정
        if (!word || typeof word !== 'string' || word.trim().length === 0) {
            return res.status(400).json({ success: false, message: '삭제할 단어를 지정해주세요.' });
        }

        const wordToDelete = word.trim();
        let fileContent = fs.readFileSync(BAD_WORDS_FILE_PATH, 'utf8');
        const words = fileContent.split(/\r?\n/);
        
        const newWords = words.filter(w => w.trim() !== wordToDelete);

        if (words.length === newWords.length) {
            return res.status(404).json({ success: false, message: `'${wordToDelete}' 단어를 찾을 수 없습니다.` });
        }

        fs.writeFileSync(BAD_WORDS_FILE_PATH, newWords.join('\n'));

        const updatedWords = reloadBadWords(); // 필터 재로드
        res.status(200).json({ success: true, message: `'${wordToDelete}' 단어가 삭제되었습니다.`, words: updatedWords });

    } catch (error) {
        res.status(500).json({ success: false, message: '단어 삭제에 실패했습니다.', error: error.message });
    }
};

export const getAllWordsForFilter = (req, res) => {
    try {
        const allWords = reloadBadWords();
        res.status(200).json({
            success: true,
            words: allWords,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: '목록을 불러오는 데 실패했습니다.', error: error.message });
    }
};
