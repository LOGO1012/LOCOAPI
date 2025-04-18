
class PageRequestDTO {

    constructor(page = 1, size = 10, qnaStatus = null, keyword = '') {

        this.page = page;
        this.size = size;
        this.qnaStatus = qnaStatus;
        this.keyword = keyword;
    }
}

export default PageRequestDTO;