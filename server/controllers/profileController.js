import fs from 'node:fs/promises';
import path from 'node:path';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { AVATAR_DIR } from '../middleware/uploadAvatar.js';

const toPublicUser = (user) => {
  const obj = user.toObject ? user.toObject() : user;
  delete obj.password;
  return obj;
};

// Public URL path under which avatars are statically served (see app.js).
const avatarUrl = (filename) => `/uploads/avatars/${filename}`;

const removeAvatarFile = async (url) => {
  if (!url) return;
  const filename = path.basename(url);
  await fs.unlink(path.join(AVATAR_DIR, filename)).catch(() => {});
};

/**
 * GET /api/profile
 * Returns the authenticated user's own profile.
 */
export const getProfile = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, user: toPublicUser(req.user) });
});

/**
 * PUT /api/profile
 * Updates the caller's own biographical/contact details. Only whitelisted
 * fields are writable here — role, isActive, salary and employeeId are not.
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, 'User not found');

  const { firstName, lastName, workEmail, phone } = req.body;

  if (firstName !== undefined) user.personalDetails.firstName = firstName;
  if (lastName !== undefined) user.personalDetails.lastName = lastName;
  if (workEmail !== undefined) user.email = workEmail.toLowerCase().trim();
  if (phone !== undefined) user.contactInfo.personalMobile = phone;

  await user.save();
  res.status(200).json({
    success: true,
    message: 'Profile updated',
    user: toPublicUser(user)
  });
});

/**
 * PATCH /api/profile/password
 * Changes the caller's password after verifying the current one.
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, 'User not found');

  const matches = await user.comparePassword(currentPassword);
  if (!matches) throw new ApiError(401, 'Current password is incorrect');

  user.password = newPassword; // hashed by pre-save hook
  await user.save();

  res.status(200).json({ success: true, message: 'Password changed successfully' });
});

/**
 * POST /api/profile/avatar
 * Stores a new avatar (multer already validated type/size) and deletes the
 * previous file to avoid orphaned uploads.
 */
export const uploadAvatarImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No avatar file provided');

  const user = await User.findById(req.user._id);
  if (!user) {
    await removeAvatarFile(avatarUrl(req.file.filename));
    throw new ApiError(404, 'User not found');
  }

  const previous = user.personalDetails.profilePictureUrl;
  user.personalDetails.profilePictureUrl = avatarUrl(req.file.filename);
  await user.save();
  await removeAvatarFile(previous);

  res.status(200).json({
    success: true,
    message: 'Avatar updated',
    profilePictureUrl: user.personalDetails.profilePictureUrl
  });
});

/**
 * DELETE /api/profile/avatar
 * Removes the avatar reference and the underlying file.
 */
export const deleteAvatarImage = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, 'User not found');

  const previous = user.personalDetails.profilePictureUrl;
  if (!previous) throw new ApiError(404, 'No avatar to delete');

  user.personalDetails.profilePictureUrl = null;
  await user.save();
  await removeAvatarFile(previous);

  res.status(200).json({ success: true, message: 'Avatar deleted' });
});
