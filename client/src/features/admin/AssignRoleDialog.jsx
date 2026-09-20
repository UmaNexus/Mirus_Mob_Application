import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import { TriangleAlert } from 'lucide-react';
import FormDialog from '../../components/ui/FormDialog.jsx';
import { updateUser } from '../../api/users.js';
import { FIELD_TIERS, FIELD_TIER_LABELS, REQUIRED_MANAGER_TIER } from '../../config/fieldForce.js';
import { fullName } from '../../config/constants.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

/** Flatten the hierarchy tree (roots + descendants + unattached) into one list, for building the manager picker. */
const flattenHierarchy = (hierarchy) => {
  if (!hierarchy) return [];
  const out = [];
  const walk = (node) => { out.push(node); (node.children || []).forEach(walk); };
  (hierarchy.roots || []).forEach(walk);
  (hierarchy.unattached || []).forEach((u) => out.push(u));
  return out;
};

export default function AssignRoleDialog({ open, user, hierarchy, onClose, onSaved }) {
  const dispatch = useDispatch();
  const [tier, setTier] = useState('');
  const [territory, setTerritory] = useState('');
  const [managerId, setManagerId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  // Set only when the server rejects a tier change because it would leave
  // existing direct reports in an invalid reporting relationship — the
  // Admin must resolve every one of them (a new valid manager each) before
  // the tier change can be retried and committed.
  const [affected, setAffected] = useState(null);
  const [reassignSelections, setReassignSelections] = useState({});

  useEffect(() => {
    if (!user) return;
    setTier(user.employeeDetails?.fieldForce?.tier || '');
    setTerritory(user.employeeDetails?.fieldForce?.territory || '');
    setManagerId(user.employeeDetails?.reportingManagerId ? String(user.employeeDetails.reportingManagerId) : '');
    setIsActive(Boolean(user.isActive));
    setAffected(null);
    setReassignSelections({});
  }, [user]);

  const allUsers = useMemo(() => flattenHierarchy(hierarchy), [hierarchy]);

  const requiredParentTier = tier ? REQUIRED_MANAGER_TIER[tier] : undefined;
  const managerOptions = useMemo(() => {
    if (!user) return [];
    if (!tier) {
      // No tier selected — any existing admin or manager-tier user can still
      // serve as a general reporting line; no tier-match enforced client-side
      // (the server only tier-validates when an effective tier is present).
      return allUsers.filter((u) => String(u._id) !== String(user._id));
    }
    if (requiredParentTier === null) {
      return allUsers.filter((u) => u.role === 'admin' || u.role === 'superadmin');
    }
    return allUsers.filter((u) => u.employeeDetails?.fieldForce?.tier === requiredParentTier && String(u._id) !== String(user._id));
  }, [allUsers, tier, requiredParentTier, user]);

  /** Valid replacement-manager candidates for one AFFECTED direct report — filtered by THAT report's own required parent tier, never the tier being assigned to `user`. */
  const optionsFor = (requiredTier) => allUsers.filter((u) => u.employeeDetails?.fieldForce?.tier === requiredTier);

  const buildPayload = () => {
    const payload = { fieldForceTier: tier || null, fieldForceTerritory: territory || undefined, isActive };
    if (managerId) payload.reportingManagerId = managerId;
    return payload;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await updateUser(user._id, buildPayload());
      dispatch(notifySuccess(`${fullName(user)} updated.`));
      onSaved?.();
    } catch (err) {
      const affectedList = err.response?.status === 409 ? err.response?.data?.details?.affected : null;
      if (affectedList?.length) {
        setAffected(affectedList);
        setReassignSelections({});
      } else {
        dispatch(notifyError(err.uiMessage));
      }
    } finally {
      setSaving(false);
    }
  };

  const submitReassignment = async (e) => {
    e.preventDefault();
    if (!user || !affected) return;
    setSaving(true);
    try {
      const reassignments = affected.map((a) => ({ userId: a.id, reportingManagerId: reassignSelections[a.id] }));
      await updateUser(user._id, { ...buildPayload(), reassignments });
      dispatch(notifySuccess(`${fullName(user)} updated — ${affected.length} direct report${affected.length === 1 ? '' : 's'} reassigned.`));
      onSaved?.();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setSaving(false);
    }
  };

  const allReassignmentsChosen = affected?.every((a) => reassignSelections[a.id]);

  if (affected) {
    return (
      <FormDialog
        open={open} onClose={onClose} onSubmit={submitReassignment} loading={saving}
        title="Reassign Affected Direct Reports" subtitle={`${fullName(user)}: ${user?.employeeDetails?.fieldForce?.tier || 'No tier'} → ${tier || 'No tier'}`}
        formId="reassign-affected-form" submitLabel="Continue"
      >
        <div className="grid grid-cols-1 gap-4 pt-1">
          <div className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-sm text-warning">
            <TriangleAlert size={18} className="mt-0.5 shrink-0" />
            <p>
              {affected.length} direct report{affected.length === 1 ? '' : 's'} will be affected by this tier change and must be reassigned to a valid manager before continuing.
            </p>
          </div>

          {affected.map((a) => (
            <div key={a.id} className="rounded-md border border-line p-3">
              <p className="font-medium text-ink">{a.name}</p>
              <p className="mb-2 text-xs text-muted">{a.tier} · Employee ID: {a.employeeId || 'None'} · Current manager: {fullName(user)}</p>
              <TextField
                select label={`New reporting manager (must be ${a.requiredManagerTier || 'Admin'})`} fullWidth size="small"
                value={reassignSelections[a.id] || ''}
                onChange={(e) => setReassignSelections((prev) => ({ ...prev, [a.id]: e.target.value }))}
              >
                {optionsFor(a.requiredManagerTier).length === 0 && <MenuItem value="" disabled>No {a.requiredManagerTier} available</MenuItem>}
                {optionsFor(a.requiredManagerTier).map((m) => (
                  <MenuItem key={m._id} value={m._id}>{fullName(m)} ({m.employeeDetails?.employeeId || m.email})</MenuItem>
                ))}
              </TextField>
            </div>
          ))}
        </div>
        {!allReassignmentsChosen && <p className="mt-2 text-xs text-muted">Select a new manager for every affected employee to continue.</p>}
      </FormDialog>
    );
  }

  return (
    <FormDialog
      open={open} onClose={onClose} onSubmit={submit} loading={saving}
      title="Change Role & Reporting Manager" subtitle={user ? fullName(user) : ''} formId="assign-role-form"
    >
      <div className="grid grid-cols-1 gap-4 pt-1">
        <TextField
          select label="Field-force tier" value={tier}
          onChange={(e) => { setTier(e.target.value); setManagerId(''); }}
          helperText="The strict Admin → NSM → ZSM → RSM → ASM → BDM hierarchy tier"
          fullWidth
        >
          <MenuItem value="">No field-force tier</MenuItem>
          {FIELD_TIERS.map((t) => <MenuItem key={t} value={t}>{t} — {FIELD_TIER_LABELS[t]}</MenuItem>)}
        </TextField>

        {tier && (
          <TextField label="Territory" value={territory} onChange={(e) => setTerritory(e.target.value)} fullWidth placeholder="e.g. Pune Central" />
        )}

        <TextField
          select label="Reporting manager" value={managerId} onChange={(e) => setManagerId(e.target.value)}
          fullWidth
          helperText={tier ? `Must be ${requiredParentTier === null ? 'an Admin' : `a ${requiredParentTier}`}` : 'Any existing user'}
        >
          <MenuItem value="">— Unchanged / none —</MenuItem>
          {managerOptions.map((m) => (
            <MenuItem key={m._id} value={m._id}>
              {fullName(m)} ({m.role === 'admin' || m.role === 'superadmin' ? 'Admin' : `${m.employeeDetails?.fieldForce?.tier} - ${m.employeeDetails?.fieldForce.territory}`})
            </MenuItem>
          ))}
        </TextField>

        <FormControlLabel control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />} label="Active account" />
      </div>
    </FormDialog>
  );
}
