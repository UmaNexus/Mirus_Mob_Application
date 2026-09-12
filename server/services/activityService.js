import Activity from '../models/Activity.js';

const actorLabel = (user) => {
  if (!user) return 'System';
  const first = user.personalDetails?.firstName || '';
  const last = user.personalDetails?.lastName || '';
  const name = `${first} ${last}`.trim();
  return name || user.email || 'User';
};

/**
 * Persist an audit-log entry. Never throws to the caller — logging must not
 * break the primary mutation.
 */
export const logActivity = async ({
  actor = null,
  action,
  entityType = '',
  entityId = '',
  message,
  meta = {}
} = {}) => {
  if (!action || !message) return null;
  try {
    return await Activity.create({
      actorId: actor?._id || null,
      actorName: actorLabel(actor),
      action: String(action).trim(),
      entityType: String(entityType || '').trim(),
      entityId: entityId != null ? String(entityId) : '',
      message: String(message).trim(),
      meta
    });
  } catch (err) {
    console.error('[activity] failed to log:', err.message);
    return null;
  }
};

/** Relative time label for dashboard cards. */
export const formatActivityTime = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay) {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export const toneForAction = (action = '') => {
  const a = String(action).toLowerCase();
  if (a.includes('accept') || a.includes('complete') || a.includes('verify')) return 'bg-success';
  if (a.includes('reject') || a.includes('delete') || a.includes('cancel')) return 'bg-danger';
  if (a.includes('offer') || a.includes('send')) return 'bg-info';
  if (a.includes('payslip') || a.includes('incentive')) return 'bg-warning';
  return 'bg-primary-500';
};
