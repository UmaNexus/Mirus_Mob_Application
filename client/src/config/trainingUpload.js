/** Keep in sync with server/middleware/uploadVideo.js + client/nginx.conf. */
export const MAX_TRAINING_VIDEO_MB = 200;
export const MAX_TRAINING_VIDEO_BYTES = MAX_TRAINING_VIDEO_MB * 1024 * 1024;
export const TRAINING_VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v';
export const TRAINING_VIDEO_FORMAT_LABEL = 'MP4, WEBM, or MOV';
export const TRAINING_VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'application/mp4'
]);
export const TRAINING_VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m4v']);

/** True when MIME is allowed, or MIME is empty/unknown but extension is allowed. */
export const isAllowedTrainingVideo = (file) => {
  if (!file) return false;
  const mime = String(file.type || '').toLowerCase().trim();
  if (mime && TRAINING_VIDEO_MIME.has(mime)) return true;
  const name = String(file.name || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot) : '';
  return TRAINING_VIDEO_EXTS.has(ext);
};
