// utils/normalizePhoneNumber.js
export function normalizePhoneNumber(phone) {
    if (!phone) return null;
    let normalized = phone;
    if (normalized.startsWith("+82")) {
        normalized = normalized.replace("+82", "0");
    }
    // 모든 공백 제거
    normalized = normalized.replace(/\s+/g, '');
    return normalized;
}
