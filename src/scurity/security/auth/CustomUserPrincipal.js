class CustomUserPrincipal {
    constructor(email) {
        this.email = email; // 사용자 이메일 설정
    }

    /**
     * 사용자 이름 (email)을 반환
     * @returns {string} 이메일
     */
    getName() {
        return this.email;
    }
}

export default CustomUserPrincipal;