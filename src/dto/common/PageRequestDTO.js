
class PageRequestDTO {

    constructor(page = 1, size = 10, qnaStatus = null) {

        this.page = page;
        this.size = size;
        this.qnaStatus = qnaStatus;
    }
}

export default PageRequestDTO;