// File: src/routes/searchRouter.js
import express from 'express';
import { createSearchRouter } from '../dto/common/search/searchRouter.js';
import { searchService }       from '../dto/common/search/searchService.js';
import PageRequestDTO from "../dto/common/PageRequestDTO.js";
import { authenticate } from '../middlewares/authMiddleware.js';
import { requireLevel } from '../middlewares/requireLevel.js';
import { ChatMessage, ChatRoom } from '../models/chat.js';
import { ChatRoomHistory } from '../models/chatRoomHistory.js';
import { Community } from '../models/Community.js';
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


// ▶ 라이브 채팅방 검색 (DTO 기반 createSearchRouter)
router.use(
    createSearchRouter({
        path: 'chat-rooms',
        Model: ChatRoom,
        textFields: ['chatUsers.nickname', 'chatUsers.name'],
        btreeFields: ['chatUsers', 'roomType', 'gameType', 'matchedGender', 'status', 'ageGroup'],
        populateFields: [{ path: 'chatUsers', select: 'nickname name' }],
        sortField: 'createdAt',
        typeField: 'roomType'      // PageRequestDTO.type → roomType 필터로 매핑
    })
);




// ▶ 히스토리 채팅방 검색 (DTO 기반 createSearchRouter)
router.use(
    createSearchRouter({
        path: 'chat-room-history',
        Model: ChatRoomHistory,
        textFields: ['meta.chatUsers.nickname', 'meta.chatUsers.name'],
        btreeFields: ['meta.chatUsers', 'meta.roomType', 'meta.capacity', 'meta.createdAt', 'meta.chatRoomId'],
        populateFields: [{ path: 'meta.chatUsers', select: 'nickname name' }],
        sortField: 'meta.createdAt',
        typeField: 'meta.roomType' // PageRequestDTO.type → meta.roomType 필터로 매핑
    })
);


// ▶ 커뮤니티 게시글 검색
router.use(
    createSearchRouter({
        path: 'community',
        Model: Community,
        textFields: ['communityTitle', 'communityContents'],
        btreeFields: ['communityCategory', 'userId']
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
//프론트엔드: 기존 useChatRooms 호출
router.get('/chat-rooms-all', async (req, res, next) => {
    try {
        const dto = new PageRequestDTO(
            Number(req.query.page),
            Number(req.query.size),
            req.query.type,      // 'friend' | 'random' | ''
            req.query.keyword    // 참여자 검색어
        );

        // 라이브 채팅방 검색
        const liveResult = await searchService(
            ChatRoom,
            dto,
            {
                textFields: ['chatUsers.nickname','chatUsers.name'],
                btreeFields: ['chatUsers','roomType','createdAt'],
                populateFields: [{ path:'chatUsers', select:'nickname name' }],
                sortField: 'createdAt',
                typeField: 'roomType'
            }
        );

        // 히스토리 채팅방 검색
        const historyResult = await searchService(
            ChatRoomHistory,
            dto,
            {
                textFields: ['meta.chatUsers.nickname','meta.chatUsers.name'],
                btreeFields: ['meta.chatUsers','meta.roomType','meta.createdAt'],
                populateFields: [{ path:'meta.chatUsers', select:'nickname name' }],
                sortField: 'meta.createdAt',
                typeField: 'meta.roomType'
            }
        );

        // 합치고 페이지네이션
        const allDocs    = [...liveResult.dtoList, ...historyResult.dtoList];
        const totalCount = liveResult.totalCount + historyResult.totalCount;
        const start      = (dto.page - 1) * dto.size;
        const docs       = allDocs.slice(start, start + dto.size);

        res.json({
            docs,
            totalCount,
            page: dto.page,
            size: dto.size,
            type: dto.type,
            keyword: dto.keyword
        });
    } catch (err) {
        next(err);
    }
});
export default router;
