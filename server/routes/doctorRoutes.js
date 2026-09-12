import { Router } from 'express';
import {
  listMyDoctors, listDoctorAlerts, listDoctors, createDoctor, updateDoctor, importDoctors
} from '../controllers/doctorController.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { requireFieldCapability } from '../middleware/fieldForceAuth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { createDoctorRules, updateDoctorRules } from '../validators/doctorValidators.js';
import validate from '../middleware/validate.js';
import { uploadXlsx } from '../middleware/uploadXlsx.js';

// Mounted at /api/doctors.
const router = Router();
router.use(verifyToken);

// BDM (or admin/superadmin via DOCTOR_VIEW) — read-only, own assigned doctors.
router.get('/mine', requireFieldCapability(PERMISSIONS.DOCTOR_VIEW, 'BDM'), listMyDoctors);
router.get('/alerts', requireFieldCapability(PERMISSIONS.DOCTOR_VIEW, 'BDM'), listDoctorAlerts);

// ASM+ (or admin/superadmin via DOCTOR_MANAGE) — management, scoped to reporting subtree.
router.get('/', requireFieldCapability(PERMISSIONS.DOCTOR_MANAGE, 'ASM'), listDoctors);
router.post('/', requireFieldCapability(PERMISSIONS.DOCTOR_MANAGE, 'ASM'), createDoctorRules, validate, createDoctor);
router.patch('/:id', requireFieldCapability(PERMISSIONS.DOCTOR_MANAGE, 'ASM'), updateDoctorRules, validate, updateDoctor);
router.post('/import', requireFieldCapability(PERMISSIONS.DOCTOR_MANAGE, 'ASM'), uploadXlsx, importDoctors);

export default router;
