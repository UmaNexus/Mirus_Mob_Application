const personName = (user) => {
  if (!user) return null;
  return `${user.personalDetails?.firstName || ''} ${user.personalDetails?.lastName || ''}`.trim() || null;
};

const roleOrTierLabel = (user) => {
  if (!user) return null;
  if (user.role === 'admin' || user.role === 'superadmin') return 'Admin';
  return user.employeeDetails?.fieldForce?.tier || user.role || null;
};

const personSummary = (user) => ({
  userId: user._id,
  name: personName(user),
  employeeId: user.employeeDetails?.employeeId || null,
  role: roleOrTierLabel(user)
});

/**
 * Build a read-only approval/decision summary for a record that already has
 * `status` + `approverId` + `decidedAt` + `decisionNote` fields (Expense,
 * LeaveRequest, MonthlyTourPlan — the only field-force domains with a real
 * approval workflow; DCR/Doctor/Stockist/SecondarySale have none, and none
 * is invented for them here).
 *
 * `approverId` must already be populated (User doc) by the caller — this
 * function never queries the database itself.
 *
 * Critically, for an ALREADY-DECIDED record this reads only what was
 * actually recorded ON THE DOCUMENT at decision time. Every `decide*`
 * controller (`decideExpense`, `decideLeave`, `decideMtp`) overwrites
 * `approverId` to the real actor's own id at the moment they approve/reject —
 * so this is the genuine historical decision-maker, never derived from the
 * CURRENT reporting hierarchy. If the hierarchy changes later (a
 * replacement, a tier change), this stays correct because it was never a
 * live lookup in the first place.
 *
 * For a still-`pending` record, `pendingWith` names who it is currently
 * awaiting decision from:
 *  - Expense/MTP already store a designated `approverId` at submission time
 *    (before any decision), so that stored field is used directly — still
 *    not a live hierarchy lookup, just read from the document.
 *  - LeaveRequest has no such stored field (`approverId` stays null until
 *    decided), so the caller may pass `pendingApproverFallback` — the
 *    requester's CURRENT reporting manager — as the only way to answer
 *    "who is this pending with" before a decision exists to record. This is
 *    a live lookup by necessity (there is nothing to record yet), and only
 *    ever used for the pending case, never to override a real historical
 *    decision.
 *
 * For draft/withdrawn/cancelled records, everything is null — there is
 * nothing pending or decided to show.
 */
export const buildApprovalInfo = (record, { pendingApproverFallback = null } = {}) => {
  const status = String(record.status || '').toLowerCase();
  const approver = record.approverId && record.approverId._id ? record.approverId : null;

  if (status === 'pending') {
    const pendingWithUser = approver || pendingApproverFallback;
    return {
      status,
      decidedBy: null,
      decidedAt: null,
      reason: null,
      pendingWith: pendingWithUser ? personSummary(pendingWithUser) : null
    };
  }

  if (status !== 'approved' && status !== 'rejected') {
    return { status, decidedBy: null, decidedAt: null, reason: null, pendingWith: null };
  }

  const decidedAt = record.decidedAt || null;
  const reason = record.decisionNote || null;

  if (!approver) {
    // A historical record whose decision-maker can no longer be resolved
    // (e.g. the approver's user record was later hard-deleted) — return
    // unknown rather than guessing at a replacement.
    return { status, decidedBy: null, decidedAt, reason, pendingWith: null };
  }

  return { status, decidedBy: personSummary(approver), decidedAt, reason, pendingWith: null };
};
