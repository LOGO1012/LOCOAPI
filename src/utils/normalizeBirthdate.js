// utils/normalizeBirthdate.js
export function normalizeBirthdate(birthyear, birthday) {
    if (!birthyear || !birthday) return null;

    // birthday가 숫자인 경우 문자열로 변환
    let bday = typeof birthday === 'number' ? birthday.toString() : birthday;

    // 만약 bday의 길이가 3이라면, 예: 112 -> "0112"
    if(bday.length === 3) {
        bday = '0' + bday;
    }

    // 만약 bday가 4자리 숫자 문자열(MMDD)라면, "YYYY-MM-DD"로 변환
    if (bday.length === 4) {
        return `${birthyear}-${bday.slice(0, 2)}-${bday.slice(2)}`;
    }
    // 만약 bday가 이미 "MM-DD" 형식이라면 그대로 사용
    return `${birthyear}-${bday}`;
}
