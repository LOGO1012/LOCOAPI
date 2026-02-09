import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuid } from 'uuid';
import sharp from 'sharp';

const UPLOAD_BASE_DIR = path.resolve('uploads');

/* 공통: 디스크에 기록 (WebP 변환 추가) */
const writeToDisk = async (buffer, folderType = 'posts') => {
    const filename = `${uuid()}.webp`;
    const uploadDir = path.join(UPLOAD_BASE_DIR, folderType);
    await fs.mkdir(uploadDir, { recursive: true });
    
    // sharp를 이용해 WebP로 변환
    const webpBuffer = await sharp(buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

    await fs.writeFile(path.join(uploadDir, filename), webpBuffer);
    return `/${folderType}/${filename}`;
};

export const saveRemoteImage = async (raw, folderType = 'posts') => {
    /* ---------- 1. Data URL 처리 ---------- */
    if (raw.startsWith('data:')) {
        const [, mimePart = '', dataPart] = raw.match(/^data:([^,]*?),(.+)$/) || [];
        if (!dataPart) return null;

        const [, mime = 'image/jpeg', enc = 'base64'] =
        mimePart.match(/^([^;]+)(?:;(.*))?$/) || [];
        if (enc !== 'base64') return null;

        const buf = Buffer.from(dataPart, 'base64');
        return writeToDisk(buf, folderType);
    }

    /* ---------- 2. 일반·스킴 누락 URL 처리 ---------- */
    const normalize = (u) => {
        if (/^https?:\/\//i.test(u)) return u;
        if (/^\/\//.test(u)) return `https:${u}`;
        return `https://${u}`;
    };

    const tryDownload = async (src) => {
        const res = await axios.get(src, { responseType: 'arraybuffer', timeout: 5000 });
        return res.data;
    };

    const primary = normalize(raw.trim());
    try {
        const data = await tryDownload(primary);
        return writeToDisk(data, folderType);
    } catch (e1) {
        const fallback = primary.replace(/^https:/i, 'http:');
        try {
            const data = await tryDownload(fallback);
            return writeToDisk(data, folderType);
        } catch (e2) {
            console.error('이미지 저장 실패:', e2.message);
            return null;
        }
    }
};
