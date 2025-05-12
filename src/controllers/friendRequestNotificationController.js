// src/controllers/friendRequestNotificationController.js
import * as svc from '../services/friendRequestNotificationService.js';

export const getNotifs = async (req, res) => {
    try {
        const data = await svc.getFriendReqNotifs(req.params.userId);
        res.json({ success: true, data });
    } catch (e) { res.status(500).json({ success:false, message:e.message }); }
};

export const markRead = async (req, res) => {
    try {
        await svc.deleteFriendReqNotif(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success:false, message:e.message }); }
};
