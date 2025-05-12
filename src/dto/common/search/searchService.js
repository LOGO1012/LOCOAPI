// src/common/search/searchService.js
import PageResponseDTO from '../PageResponseDTO.js';

export async function searchService(Model, pageReq, options = {}) {
    const { page=1, size=10, keyword, searchType } = pageReq;
    const { textFields = [], btreeFields = [] } = options;
    const skip = (page - 1) * size;
    const filter = {};

    // 1) 상태·카테고리 등 정확 조회
    for (const field of btreeFields) {
        if (pageReq[field] != null) {
            filter[field] = pageReq[field];
        }
    }

    // 2) 키워드 검색: full‑text 우선
    if (keyword && textFields.length > 0) {
        // textFields로 설정된 필드 전부 텍스트 인덱스 대상이라면
        if (searchType === 'text') {
            filter.$text = { $search: keyword };
        } else if (textFields.includes(searchType)) {
            // 특정 textFields 하나만
            filter.$text = { $search: keyword };
            // (MongoDB 텍스트 인덱스는 인덱스 설정 순서에 따라 검색 필드를 자동 적용)
        } else if (searchType === 'both') {
            // 기본 both → $or + regex (보조)
            const regex = new RegExp(keyword, 'i');
            filter.$or = textFields.map(f => ({ [f]: { $regex: regex } }));
        }
    }

    // 3) 쿼리 실행
    const [docs, totalCount] = await Promise.all([
        Model.find(filter)
            .skip(skip)
            .limit(size)
            .lean(),
        Model.countDocuments(filter)
    ]);

    return new PageResponseDTO(docs, pageReq, totalCount);
}
