// src/dto/common/search/searchService.js
import PageResponseDTO from '../../common/PageResponseDTO.js';

export async function searchService(Model, pageReqDto, options = {}) {
    // PageRequestDTO 필드 바로 사용
    const { page, size, type, keyword } = pageReqDto;

    const {
        match = {},
        textFields = [],
        btreeFields = [],
        populateFields = [],
        sortField = 'createdAt',
        sortOrder = -1
    } = options;

    // 기본 match 에 DTO 의 type(roomType) 필터 병합
    const baseMatch = { ...match };
    if (type) {
        // 라이브엔티티는 roomType, 히스토리엔티티는 meta.roomType 으로 옵션에 맞춰 넣어주세요
        baseMatch[options.typeField || 'roomType'] = type;
    }

    // 1) B-Tree 필터
    const btreeFilter = btreeFields.reduce((acc, field) => {
        const val = pageReqDto[field];
        if (val != null) acc[field] = val;
        return acc;
    }, {});

    // 2) 텍스트 검색 조건
    const filter = { ...baseMatch, ...btreeFilter };
    if (keyword) {
        const regex = new RegExp(keyword, 'i');
        filter.$or = textFields.map(f => ({ [f]: regex }));
    }

    // 3) Mongoose 쿼리 빌드
    let query = Model.find(filter);
    populateFields.forEach(({ path, select }) => {
        query = query.populate(path, select);
    });
    query = query.sort({ [sortField]: sortOrder })
        .skip((page - 1) * size)
        .limit(size);

    // 4) 실행
    const [docs, totalCount] = await Promise.all([
        query.exec(),
        Model.countDocuments(filter)
    ]);

    // 5) PageResponseDTO 로 감싸서 반환
    return new PageResponseDTO(docs, { page, size, type, keyword }, totalCount);
}
