class PageRequestDTO {
    constructor(page = 1, size = 10, qnaStatus = '', keyword = '', searchType   = 'both') {
        this.page = page;
        this.size = size;
        this.qnaStatus = qnaStatus;
        this.keyword = keyword;
        this.searchType = searchType;

    }
}
export default PageRequestDTO;
