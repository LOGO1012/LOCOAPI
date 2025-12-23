// LOCOAPI/src/scheduler/userArchiveScheduler.js
import cron from 'node-cron';
import { User } from '../models/UserProfile.js';
import { archiveUserData } from '../services/userService.js';

// Define the task but do not start it immediately. It will be started by the main application.
const task = cron.schedule('0 0 * * *', async () => {
    console.log('--- ⏰ 매일 사용자 보관 스케줄러 실행 ---');
    try {
        // Deactivation grace period (7 days) + re-registration window (30 days) = 37 days
        const archiveThreshold = new Date();
        archiveThreshold.setDate(archiveThreshold.getDate() - 37);

        console.log(`🔍 보관 대상 검색: ${archiveThreshold.toISOString()} 이전에 탈퇴한 사용자`);

        // Find users who were deactivated more than 37 days ago and are not yet archived.
        const usersToArchive = await User.find({
            status: 'deactivated',
            deactivatedAt: { $lt: archiveThreshold }
        }).select('_id').lean();

        if (usersToArchive.length === 0) {
            console.log('✅ 보관할 사용자가 없습니다.');
            console.log('--- 스케줄러 실행 완료 ---');
            return;
        }

        console.log(`🗄️ ${usersToArchive.length}명의 사용자를 보관 처리합니다.`);

        // Process each user for archival.
        for (const user of usersToArchive) {
            await archiveUserData(user._id);
        }

        console.log(`🎉 ${usersToArchive.length}명의 사용자 보관 처리 완료.`);
        console.log('--- 스케줄러 실행 완료 ---');

    } catch (error) {
        console.error('❌ 사용자 보관 스케줄러 실행 중 오류 발생:', error);
    }
}, {
    scheduled: false, // The task is not started automatically.
    timezone: "Asia/Seoul"
});

// Export a function that starts the scheduler.
export const startUserArchiveScheduler = () => task.start();
