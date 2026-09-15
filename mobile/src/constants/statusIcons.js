import {
  FilePenLine, Clock3, CircleCheck, CircleX, Undo2, CircleDot, CircleAlert
} from 'lucide-react-native';

/**
 * One status → icon mapping shared by every StatusBadge across the app
 * (MTP draft/pending/approved/rejected/withdrawn, expense pending/approved/
 * rejected, DCR submission state, stockist Active/Inactive, secondary-sale
 * expiry). Keyed by the exact lowercased label StatusBadge is given — add a
 * new entry here rather than inventing a one-off icon at a call site.
 */
export const STATUS_ICON_BY_LABEL = {
  draft: FilePenLine,
  pending: Clock3,
  'pending submission': Clock3,
  approved: CircleCheck,
  submitted: CircleCheck,
  rejected: CircleX,
  expired: CircleX,
  withdrawn: Undo2,
  active: CircleCheck,
  inactive: CircleDot,
  completed: CircleCheck,
  missed: CircleX
};

/** Falls back to a tone-based icon when the exact label isn't in the map above (e.g. "3d left", "joint", "missed"). */
export const STATUS_ICON_BY_TONE = {
  success: CircleCheck,
  warning: CircleAlert,
  danger: CircleX,
  info: CircleDot,
  neutral: null
};
