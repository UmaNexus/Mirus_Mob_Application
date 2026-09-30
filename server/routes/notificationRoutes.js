import { Router } from 'express';
import {
  registerDevice,
  unregisterDevice,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  triggerSchedulerJobs,
} from '../controllers/notificationController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = Router();

router.use(verifyToken);

router.post('/devices/register', registerDevice);
router.post('/devices/unregister', unregisterDevice);
router.post('/scheduler/run', triggerSchedulerJobs);
router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/mark-all-read', markAllAsRead);
router.patch('/:id/read', markAsRead);

export default router;
