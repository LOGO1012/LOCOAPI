// src/schedulers/resetStarScheduler.js
import cron from 'node-cron';
import mongoose from 'mongoose';
import { User } from '../models/UserProfile.js';

// 매 달 1일 00:05 KST 실행 (서버 TZ가 KST라면)
// ┌──────── ┬───────── ┬──────────┬──────────┬──────── ┬─────────┐
// │ minute  │ hour     │ dayOfMon │ month    │ dayWk   │ command │
// └──────── ┴───────── ┴──────────┴──────────┴──────── ┴─────────┘
const task = cron.schedule('0 0 1 * *', async () => {
    try {
        const { modifiedCount } = await User.updateMany(
            {},              // 전체 문서
            { $set: { star: 0 } }
        );
        console.log(`[Star Reset] ${modifiedCount} users reset at`, new Date());
    } catch (err) {
        console.error('[Star Reset] failed:', err);
    }
}, {
    timezone: 'Asia/Seoul',  // 서버 TZ가 UTC라도 KST 기준으로 동작
    scheduled: false         // 애플리케이션 부팅 후手動 start
});

// 애플리케이션이 구동될 때 start
export const startResetStarScheduler = () => task.start();
