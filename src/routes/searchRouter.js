// File: src/routes/searchRouter.js
import express from 'express';
import { createSearchRouter } from '../dto/common/search/searchRouter.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requireLevel } from '../middlewares/requireLevel.js';
import { ChatMessage, ChatRoom } from '../models/chat.js';
import { ChatRoomHistory } from '../models/chatRoomHistory.js';
import { Community } from '../models/Community.js';
import { PaymentHistory } from '../models/PaymentHistory.js';
import { Qna } from '../models/Qna.js';
import { Report } from '../models/report.js';
import { ReportNotification } from '../models/ReportNotification.js';
import { User } from '../models/UserProfile.js';

const router = express.Router();

// ▶ LV3 이상만 검색 가능 (채팅 관련)
router.use(
    ['/users', '/chat-messages', '/chat-rooms', '/chat-room-history'],
    authenticate,
    requireLevel(3)
);


// ▶ 채팅 메시지 검색
router.use(
    createSearchRouter({
        path: 'chat-messages',
        Model: ChatMessage,
        textFields: ['text'],
        btreeFields: ['chatRoom', 'sender']
    })
);

// ▶ 채팅방 검색 (라이브)
router.use(
    createSearchRouter({
        path: 'chat-rooms',
        Model: ChatRoom,
        textFields: [],
        btreeFields: [
            'chatUsers',
            'roomType',
            'gameType',
            'matchedGender',
            'status',
            'ageGroup'
        ]
    })
);

// ▶ 랜덤채팅 히스토리 검색 (유저 닉네임·이름 포함)
router.get('/chat-room-history', async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const size = parseInt(req.query.size) || 10;
        const skip = (page - 1) * size;

        // 필터 구성
        const filter = {};
        if (req.query['meta.chatUsers']) {
            filter['meta.chatUsers'] = req.query['meta.chatUsers'];
        }
        // (필요한 다른 필터를 추가로 설정)

        // 전체 개수 조회
        const totalCount = await ChatRoomHistory.countDocuments(filter);

        // 실제 조회: meta.chatUsers 필드를 populate 해서 nickname, name 가져오기
        const docs = await ChatRoomHistory.find(filter)
            .populate('meta.chatUsers', 'nickname name')     // ← 여기서 유저 정보 로드 :contentReference[oaicite:2]{index=2}:contentReference[oaicite:3]{index=3}
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(size);

        // DTO 형태로 변환
        const dtoList = docs.map(h => ({
            chatRoomId: h.chatRoomId,
            meta: { ...h.meta.toObject() },
            timestamp: h.timestamp
        }));

        res.json({ dtoList, totalCount, current: page, size });
    } catch (err) {
        next(err);
    }
});


// ▶ 커뮤니티 게시글 검색
router.use(
    createSearchRouter({
        path: 'community',
        Model: Community,
        textFields: ['communityTitle', 'communityContents'],
        btreeFields: ['communityCategory', 'userId']
    })
);

// ▶ 결제 내역 검색
router.use(
    createSearchRouter({
        path: 'payments',
        Model: PaymentHistory,
        textFields: ['payId', 'paymentMethod'],
        btreeFields: ['userId', 'paymentId', 'payStatus']
    })
);

// ▶ QnA 검색
router.use(
    createSearchRouter({
        path: 'qna',
        Model: Qna,
        textFields: ['qnaTitle', 'qnaContents', 'qnaAnswer'],
        btreeFields: ['qnaStatus', 'userId', 'answerUserId']
    })
);

// ▶ 신고 검색
router.use(
    createSearchRouter({
        path: 'reports',
        Model: Report,
        textFields: ['reportTitle', 'reportContants', 'reportAnswer'],
        btreeFields: [
            'reportArea',
            'reportCategory',
            'reportErId',
            'offenderId'
        ]
    })
);

// ▶ 알림 검색
router.use(
    createSearchRouter({
        path: 'notifications',
        Model: ReportNotification,
        textFields: ['content'],
        btreeFields: ['receiver', 'type', 'isRead']
    })
);

// ▶ 사용자 검색
router.use(
    createSearchRouter({
        path: 'users',
        Model: User,
        textFields: ['name', 'nickname', 'info'],
        btreeFields: ['gender', 'userLv']
    })
);

export default router;
