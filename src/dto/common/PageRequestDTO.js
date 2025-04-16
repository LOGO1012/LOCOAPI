class PageRequestDTO {
    constructor(page = 1, size = 10, qnaStatus = '', keyword = '') {
        this.page = page;
        this.size = size;
        this.qnaStatus = qnaStatus;
        this.keyword = keyword;
    }
}
export default PageRequestDTO;
