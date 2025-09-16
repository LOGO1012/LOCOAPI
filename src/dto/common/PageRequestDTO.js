class PageRequestDTO {
    constructor(page = 1, size = 10, qnaStatus = '', keyword = '', searchType   = 'both', userId = null) {
        this.page = page;
        this.size = size;
        this.qnaStatus = qnaStatus;
        this.keyword = keyword;
        this.searchType = searchType;
        this.userId = userId; // ◀◀◀ userId 필드 추가
    }
}
export default PageRequestDTO;
