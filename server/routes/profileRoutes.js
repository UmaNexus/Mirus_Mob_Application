import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  changePassword,
  uploadAvatarImage,
  deleteAvatarImage
} from '../controllers/profileController.js';
import { verifyToken, authorizeRoles } from '../middleware/authMiddleware.js';
import { uploadAvatar } from '../middleware/uploadAvatar.js';
import { updateProfileRules, changePasswordRules } from '../validators/profileValidators.js';
import validate from '../middleware/validate.js';

const router = Router();

// Every profile route requires a valid session. These are "self" routes — the
// caller acts on their own record — so any authenticated role is permitted.
router.use(verifyToken);
const selfRoles = authorizeRoles(['admin', 'hr', 'employee']);

router.get('/', getProfile);
router.put('/', selfRoles, updateProfileRules, validate, updateProfile);
router.patch('/password', selfRoles, changePasswordRules, validate, changePassword);
router.post('/avatar', selfRoles, uploadAvatar, uploadAvatarImage);
router.delete('/avatar', selfRoles, deleteAvatarImage);

export default router;
