import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuid } from 'uuid';
import sharp from 'sharp';
import dns from 'dns/promises';

const UPLOAD_BASE_DIR = path.resolve('uploads');

/* H-16 보안 조치: SSRF 방지 - 내부 IP/메타데이터 엔드포인트 차단 */
const BLOCKED_HOSTNAMES = [
    'localhost', '127.0.0.1', '0.0.0.0', '[::1]', '[::0]',
    'metadata.google.internal',           // GCP 메타데이터
    'metadata.google.internal.',
];

const isPrivateIP = (ip) => {
    // IPv4 사설/예약 대역
    const parts = ip.split('.').map(Number);
    if (parts.length === 4) {
        if (parts[0] === 10) return true;                                    // 10.0.0.0/8
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
        if (parts[0] === 192 && parts[1] === 168) return true;              // 192.168.0.0/16
        if (parts[0] === 127) return true;                                   // 127.0.0.0/8
        if (parts[0] === 169 && parts[1] === 254) return true;              // 169.254.0.0/16 (link-local, AWS 메타데이터)
        if (parts[0] === 0) return true;                                     // 0.0.0.0/8
    }
    // IPv6 loopback / link-local
    if (ip === '::1' || ip === '::' || ip.startsWith('fe80:') || ip.startsWith('fc00:') || ip.startsWith('fd')) return true;
    return false;
};

const validateUrl = async (urlStr) => {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();

    // 차단 호스트명 확인
    if (BLOCKED_HOSTNAMES.includes(hostname)) {
        throw new Error(`SSRF 차단: 허용되지 않는 호스트 - ${hostname}`);
    }

    // DNS 조회 후 IP 검증
    try {
        const { address } = await dns.lookup(hostname);
        if (isPrivateIP(address)) {
            throw new Error(`SSRF 차단: 내부 IP 접근 시도 - ${hostname} → ${address}`);
        }
    } catch (err) {
        if (err.message.startsWith('SSRF')) throw err;
        throw new Error(`SSRF 차단: DNS 조회 실패 - ${hostname}`);
    }
};

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
        // H-16: URL 요청 전 SSRF 검증
        await validateUrl(primary);
        const data = await tryDownload(primary);
        return writeToDisk(data, folderType);
    } catch (e1) {
        // SSRF 차단은 fallback 없이 즉시 중단
        if (e1.message.startsWith('SSRF')) {
            console.warn(`⚠️ [H-16] ${e1.message}`);
            return null;
        }
        const fallback = primary.replace(/^https:/i, 'http:');
        try {
            await validateUrl(fallback);
            const data = await tryDownload(fallback);
            return writeToDisk(data, folderType);
        } catch (e2) {
            if (e2.message.startsWith('SSRF')) {
                console.warn(`⚠️ [H-16] ${e2.message}`);
                return null;
            }
            console.error('이미지 저장 실패:', e2.message);
            return null;
        }
    }
};
