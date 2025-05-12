// src/routes/friendRequestNotificationRoutes.js
import express from 'express';
import * as ctrl from '../controllers/friendRequestNotificationController.js';
const router = express.Router();

router.get('/:userId', ctrl.getNotifs);
router.put('/:id/read',    ctrl.markRead);

export default router;
