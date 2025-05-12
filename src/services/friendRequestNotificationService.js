// src/services/friendRequestNotificationService.js
import { FriendRequestNotification } from '../models/friendRequestNotification.js';

export const createFriendReqNotif = async ({ recipient, sender, message }) =>
    await FriendRequestNotification.create({ recipient, sender, message });

export const getFriendReqNotifs = async (userId) =>
    await FriendRequestNotification.find({ recipient: userId, isRead: false })
        .populate('sender', 'nickname');

// 삭제 처리: 읽음 처리 시 알림 문서 자체를 삭제
export const deleteFriendReqNotif = async (notifId) =>
    await FriendRequestNotification.findByIdAndDelete(notifId);
