// src/utils/encryptedSearch.js
import { User } from '../models/UserProfile.js';
import { encrypt, decrypt, createSearchHash } from './encryption.js';

/**
 * 암호화된 필드로 사용자 검색
 * 평문과 암호화된 데이터 모두에서 검색 가능 (마이그레이션 기간 호환성)
 */
export async function findUserByEncryptedFields(searchCriteria) {
    const queries = [];
    
    // 각 필드에 대해 평문과 암호화된 버전 모두 검색
    for (const [field, value] of Object.entries(searchCriteria)) {
        if (value) {
            const encryptedValue = encrypt(value);
            
            // 평문 또는 암호화된 값으로 검색
            queries.push({
                $or: [
                    { [field]: value },           // 평문 데이터 (기존)
                    { [field]: encryptedValue }   // 암호화된 데이터 (신규)
                ]
            });
        }
    }
    
    if (queries.length === 0) {
        return null;
    }
    
    // 모든 조건을 만족하는 사용자 검색
    const query = queries.length === 1 ? queries[0] : { $and: queries };
    return await User.findOne(query);
}

/**
 * 전화번호로 사용자 검색 (암호화 호환)
 */
export async function findUserByPhone(phone) {
    if (!phone) return null;
    
    return await findUserByEncryptedFields({ phone });
}

/**
 * 이름과 전화번호로 사용자 검색 (암호화 호환)
 */
export async function findUserByNameAndPhone(name, phone) {
    if (!name || !phone) return null;
    
    return await findUserByEncryptedFields({ name, phone });
}

/**
 * 공통 식별자로 사용자 검색 (암호화 호환)
 */
export async function findUserByCommonIdentifiers(name, phone, birthdate) {
    if (!name || !phone || !birthdate) return null;
    
    return await findUserByEncryptedFields({ name, phone, birthdate });
}

/**
 * 소셜 로그인 연동 시 기존 사용자 검색 (암호화 호환)
 */
export async function findUserBySocialInfo(socialData) {
    const { name, phoneNumber, providerId, provider } = socialData;
    
    // 1. providerId로 먼저 검색
    if (providerId && provider) {
        const providerQuery = {};
        providerQuery[`social.${provider}.providerId`] = providerId;
        
        const userByProvider = await User.findOne(providerQuery);
        if (userByProvider) {
            return userByProvider;
        }
    }
    
    // 2. 공통 식별자로 검색 (암호화 호환)
    if (name && phoneNumber) {
        return await findUserByEncryptedFields({ 
            name, 
            phone: phoneNumber 
        });
    }
    
    return null;
}
