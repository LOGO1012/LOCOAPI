
class PageResponseDTO {
    constructor(dtoList, pageRequestDTO, totalCount) {
        this.dtoList = dtoList;
        this.pageRequestDTO = pageRequestDTO;
        this.totalCount = totalCount;

        const page = pageRequestDTO.page;
        const size = pageRequestDTO.size;

        // Calculate page number range
        let end = Math.ceil(page / 10) * 10;
        let start = end - 9;

        const totalPages = Math.ceil(totalCount / size);
        end = end > totalPages ? totalPages : end;

        // Determine if there are previous or next pages
        this.prev = start > 1;
        this.next = totalCount > end * size;

        // Generate page numbers
        this.pageNumList = Array.from({ length: end - start + 1 }, (_, i) => start + i);

        // Set previous and next page numbers
        this.prevPage = this.prev ? start - 1 : null;
        this.nextPage = this.next ? end + 1 : null;

        // Set total pages and current page
        this.totalPage = this.pageNumList.length;
        this.current = pageRequestDTO.page;
    }
}

export default PageResponseDTO;