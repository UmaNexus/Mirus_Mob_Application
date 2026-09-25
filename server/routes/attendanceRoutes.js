import { Router } from 'express';
import {
  markMyAttendance, listMyAttendance, markAttendance, markBulkAttendance, bulkUploadAttendance, listAttendance,
  punchIn, punchOut, getTodayAttendance,
  applyLeave, listMyLeaves, listLeaves, decideLeave, cancelLeave,
  createHoliday, listHolidays, deleteHoliday
} from '../controllers/attendanceController.js';
import { verifyToken, requirePermission, requireNonAdmin } from '../middleware/authMiddleware.js';
import { requireFieldCapability } from '../middleware/fieldForceAuth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { uploadXlsx } from '../middleware/uploadXlsx.js';

// Mounted at /api (so paths read /attendance, /leaves, /holidays).
const router = Router();
router.use(verifyToken);

// Attendance
router.post('/attendance/mark', markMyAttendance);
router.get('/attendance/mine', listMyAttendance);
// Mobile real timestamped punch (Milestone 6) — separate from the
// whole-day-status self-mark above. Available to every non-admin account
// (any field-force tier, HR, or a plain employee) — only Admin/superadmin
// are excluded, per explicit product decision (they manage the org, they
// don't punch their own attendance here).
router.post('/attendance/punch-in', requireNonAdmin, punchIn);
router.post('/attendance/punch-out', requireNonAdmin, punchOut);
router.get('/attendance/today', requireNonAdmin, getTodayAttendance);
router.post('/attendance', requirePermission(PERMISSIONS.ATTENDANCE_MANAGE), markAttendance);
router.post('/attendance/bulk', requirePermission(PERMISSIONS.ATTENDANCE_MANAGE), markBulkAttendance);
router.post('/attendance/bulk-upload', requirePermission(PERMISSIONS.ATTENDANCE_MANAGE), uploadXlsx, bulkUploadAttendance);
router.get('/attendance', requirePermission(PERMISSIONS.ATTENDANCE_MANAGE), listAttendance);

// Leave
router.post('/leaves', applyLeave);
router.get('/leaves/mine', listMyLeaves);
router.patch('/leaves/:id/cancel', cancelLeave);
router.get('/leaves', requireFieldCapability(PERMISSIONS.LEAVE_APPROVE, 'ASM'), listLeaves);
router.patch('/leaves/:id/decision', requireFieldCapability(PERMISSIONS.LEAVE_APPROVE, 'ASM'), decideLeave);


// Holidays
router.get('/holidays', listHolidays); // any authenticated user
router.post('/holidays', requirePermission(PERMISSIONS.HOLIDAY_MANAGE), createHoliday);
router.delete('/holidays/:id', requirePermission(PERMISSIONS.HOLIDAY_MANAGE), deleteHoliday);

export default router;
