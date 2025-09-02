import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuid } from 'uuid';

const UPLOAD_BASE_DIR = path.resolve('uploads');

/* 공통: 디스크에 기록 */
const writeToDisk = async (buffer, ext, folderType = 'posts') => { // 수정됨
    const filename = `${uuid()}${ext}`;
    const uploadDir = path.join(UPLOAD_BASE_DIR, folderType); // 수정됨
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, filename), buffer);
    return `/${folderType}/${filename}`; // 수정됨
};

export const saveRemoteImage = async (raw, folderType = 'posts') => { // 수정됨
    /* ---------- 1. Data URL 처리 ---------- */
    if (raw.startsWith('data:')) {
        const [, mimePart = '', dataPart] = raw.match(/^data:([^,]*?),(.+)$/) || [];
        if (!dataPart) return null;

        const [, mime = 'image/jpeg', enc = 'base64'] =
        mimePart.match(/^([^;]+)(?:;(.*))?$/) || [];
        if (enc !== 'base64') return null;

        const ext = `.${mime.split('/')[1] || 'jpg'}`;
        const buf = Buffer.from(dataPart, 'base64');
        return writeToDisk(buf, ext, folderType); // 수정됨
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
        const ext = path.extname(new URL(primary).pathname) || '.jpg';
        return writeToDisk(data, ext, folderType); // 수정됨
    } catch (e1) {
        const fallback = primary.replace(/^https:/i, 'http:');
        try {
            const data = await tryDownload(fallback);
            const ext = path.extname(new URL(fallback).pathname) || '.jpg';
            return writeToDisk(data, ext, folderType); // 수정됨
        } catch (e2) {
            console.error('이미지 저장 실패:', e2.message);
            return null;
        }
    }
};
