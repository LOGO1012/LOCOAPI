// seed.js
import connectMongoDB from './src/config/mongoDB.js'; // mongoDB 연결 함수
import { Community } from './src/models/Community.js'; // Community 모델
import { Qna } from './src/models/Qna.js'; // Qna 모델
import mongoose from 'mongoose';

// 더미 커뮤니티 데이터
const dummyCommunities = [
    {
        userId: "67bc2846c9d62c1110715d89", // 실제 사용자 _id로 변경 필요
        communityTitle: '첫 번째 커뮤니티 게시글',
        communityContents: '첫 번째 커뮤니티 게시글 내용입니다.',
        communityCategory: '자유',
        communityImage: null,
        recommended: 5,
        communityViews: 100,
        comments: [
            {
                userId: "67bc2846c9d62c1110715d8a",
                commentContents: '첫 번째 댓글입니다.'
            },
            {
                userId: "67bc2846c9d62c1110715d8b",
                commentContents: '두 번째 댓글입니다.'
            }
        ],
    },
    {
        userId: "67bc2846c9d62c1110715d8a",
        communityTitle: '두 번째 커뮤니티 게시글',
        communityContents: '두 번째 커뮤니티 게시글 내용입니다.',
        communityCategory: '유머',
        communityImage: 'http://example.com/community2.jpg',
        recommended: 8,
        communityViews: 150,
        comments: [
            {
                userId: "67bea7c29118c00aca0d5f1c",
                commentContents: '재미있네요!'
            }
        ],
    },
    {
        userId: "67bea7c29118c00aca0d5f1d",
        communityTitle: '세 번째 커뮤니티 게시글',
        communityContents: '세 번째 커뮤니티 게시글 내용입니다.',
        communityCategory: '질문',
        communityImage: null,
        recommended: 2,
        communityViews: 75,
        comments: [],
    }
];

// 더미 QnA 데이터
const dummyQnas = [
    {
        qnaTitle: "첫 번째 문의 제목",
        qnaContents: "첫 번째 문의 내용입니다. 이 내용은 문의에 대한 상세한 설명입니다.",
        qnaAnswer: null,
        qnaStatus: "Pending",
        userId: new mongoose.Types.ObjectId("67bc2846c9d62c1110715d89"),
        answerUserId: null,
    },
    {
        qnaTitle: "두 번째 문의 제목",
        qnaContents: "두 번째 문의 내용입니다. 사용자가 문의한 내용에 대한 추가 정보입니다.",
        qnaAnswer: "두 번째 문의에 대한 답변입니다.",
        qnaStatus: "Answered",
        userId: new mongoose.Types.ObjectId("67bc2846c9d62c1110715d8a"),
        answerUserId: new mongoose.Types.ObjectId("67bc2846c9d62c1110715d8b"),
    },
    {
        qnaTitle: "세 번째 문의 제목",
        qnaContents: "세 번째 문의 내용입니다. 추가 설명이 포함된 문의입니다.",
        qnaAnswer: null,
        qnaStatus: "Pending",
        userId: new mongoose.Types.ObjectId("67bea7c29118c00aca0d5f1c"),
        answerUserId: null,
    }
];

const seedData = async () => {
    try {
        // MongoDB 연결
        await connectMongoDB();
        console.log("MongoDB 연결 성공");

        // 기존 커뮤니티 데이터 삭제
        await Community.deleteMany({});
        console.log("기존 커뮤니티 데이터 삭제 완료");

        // 더미 커뮤니티 데이터 삽입
        await Community.insertMany(dummyCommunities);
        console.log("커뮤니티 더미 데이터 삽입 완료");

        // 기존 QnA 데이터 삭제
        await Qna.deleteMany({});
        console.log("기존 QnA 데이터 삭제 완료");

        // 더미 QnA 데이터 삽입
        await Qna.insertMany(dummyQnas);
        console.log("QnA 더미 데이터 삽입 완료");

        // 연결 종료
        await mongoose.connection.close();
    } catch (err) {
        console.error("데이터 삽입 중 오류 발생:", err);
    }
};

// 더미 데이터 삽입 실행
seedData();




// import connectMongoDB from './src/config/mongoDB.js'; // mongoDB.js에서 연결 함수 가져오기
// import { User } from './src/models/UserProfile.js'; // User 모델 불러오기
// import { ChatRoom } from './src/models/chat.js'; // ChatRoom 모델 불러오기
// import mongoose from 'mongoose'; // mongoose 모듈 불러오기
//
// // 더미 유저 데이터
// // const dummyUsers = [
// //     {
// //         name: 'John Doe',
// //         nickname: 'johndoe123',
// //         phone: '010-1234-5678',
// //         birthdate: new Date('1990-01-01'),
// //         accountLink: '',
// //     },
// //     {
// //         name: 'Jane Smith',
// //         nickname: 'janesmith456',
// //         phone: '010-9876-5432',
// //         birthdate: new Date('1995-05-15'),
// //         accountLink: '',
// //     },
// //     {
// //         name: 'Alice Brown',
// //         nickname: 'alicebrown789',
// //         phone: '010-5678-1234',
// //         birthdate: new Date('1992-03-10'),
// //         accountLink: '',
// //     },
// //     {
// //         name: 'Bob Johnson',
// //         nickname: 'bobjohnson234',
// //         phone: '010-3456-7890',
// //         birthdate: new Date('1988-07-22'),
// //         accountLink: '',
// //     },
// //     {
// //         name: 'Charlie Davis',
// //         nickname: 'charliedavis567',
// //         phone: '010-8765-4321',
// //         birthdate: new Date('1993-11-30'),
// //         accountLink: '',
// //     },
// //     {
// //         name: 'Emma Wilson',
// //         nickname: 'emmawilson890',
// //         phone: '010-6789-0123',
// //         birthdate: new Date('1997-09-05'),
// //         accountLink: '',
// //     }
// // ];
//
//
// // 더미 채팅방 데이터
// const dummyChatRooms = [
//     // {
//     //     chatUsers: [], // 채팅방의 참여자들, 실제 _id 값으로 채워짐
//     //     roomType: 'friend',
//     //     capacity: null,
//     //     isActive: true,
//     //     createdAt: new Date(),
//     // },
//     // {
//     //     chatUsers: [],
//     //     roomType: 'friend',
//     //     capacity: null,
//     //     isActive: true,
//     //     createdAt: new Date(),
//     // },
//     // {
//     //     chatUsers: [],
//     //     roomType: 'friend',
//     //     capacity: null,
//     //     isActive: true,
//     //     createdAt: new Date(),
//     // },
//     {
//         chatUsers: [],
//         roomType: 'random',
//         capacity: 2,
//         isActive: true,
//         createdAt: new Date(),
//     }
// ];
//
// // 더미 데이터 삽입 함수
// const seedData = async () => {
//     try {
//         // MongoDB 연결
//         await connectMongoDB();
//
//         // 더미 유저 데이터 삽입 (MongoDB가 _id를 자동으로 생성)
//         const insertedUsers = await User.insertMany(dummyUsers);
//         console.log('유저 더미 데이터 삽입 완료');
//
//         // 삽입된 유저들의 _id를 사용하여 채팅방 데이터를 삽입
//         const userIds = insertedUsers.map(user => user._id.toString());
//
//         // 더미 채팅방 데이터에 유저들의 _id 값을 채팅방에 넣음
//         const updatedChatRooms = dummyChatRooms.map((room, index) => ({
//             ...room,
//             chatUsers: userIds.slice(index * 2, (index * 2) + 2) // 예시로 2명의 사용자만 할당
//         }));
//
//         // 더미 채팅방 데이터 삽입
//         await ChatRoom.insertMany(updatedChatRooms);
//         console.log('채팅방 더미 데이터 삽입 완료');
//
//         // 연결 종료
//         await mongoose.connection.close();
//     } catch (err) {
//         console.error('데이터 삽입 중 오류 발생:', err);
//     }
// };
//
// // 더미 데이터 삽입 실행
// seedData();
