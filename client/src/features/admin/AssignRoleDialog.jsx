import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import FormDialog from '../../components/ui/FormDialog.jsx';
import { updateUserFull, getEligibleManagers } from '../../api/users.js';
import { listJobRoles } from '../../api/jobRoles.js';
import { fullName } from '../../config/constants.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

export default function AssignRoleDialog({ open, user, onClose, onSaved }) {
  const dispatch = useDispatch();
  const [jobRoles, setJobRoles] = useState([]);
  const [jobRoleId, setJobRoleId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [workLocation, setWorkLocation] = useState('');
  const [locationTouched, setLocationTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [managerOptions, setManagerOptions] = useState([]);
  const [inactiveEligible, setInactiveEligible] = useState([]);
  const [loadingManagers, setLoadingManagers] = useState(false);
  const isAdminUser = user?.role === 'admin' || user?.role === 'superadmin';

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listJobRoles().then((rows) => { if (!cancelled) setJobRoles(rows || []); }).catch(() => { if (!cancelled) setJobRoles([]); });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!user) return;
    setJobRoleId(user.jobRole?.id || '');
    setManagerId(user.employeeDetails?.reportingManagerId ? String(user.employeeDetails.reportingManagerId) : '');
    setIsActive(Boolean(user.isActive));
    setWorkLocation(user.employeeDetails?.workLocation || '');
    setLocationTouched(false);
  }, [user]);

  // Candidates come from the server for the role currently selected in this dialog.
  useEffect(() => {
    if (!open || !user || isAdminUser) { setManagerOptions([]); return undefined; }
    let cancelled = false;
    setLoadingManagers(true);
    getEligibleManagers(user._id, jobRoleId || null)
      .then((res) => {
        if (cancelled) return;
        const rows = res?.data || [];
        setInactiveEligible(res?.inactiveEligible || []);
        setManagerOptions(rows);
        // A previously chosen manager that is not valid for this role is dropped from the form.
        setManagerId((cur) => (rows.some((m) => String(m._id) === String(cur)) ? cur : ''));
      })
      .catch(() => { if (!cancelled) { setManagerOptions([]); setInactiveEligible([]); } })
      .finally(() => { if (!cancelled) setLoadingManagers(false); });
    return () => { cancelled = true; };
  }, [open, user, jobRoleId, isAdminUser]);

  const submit = async (e) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const payload = { jobRoleId: jobRoleId || null, isActive };
      if (managerId && !isAdminUser) payload.reportingManagerId = managerId;
      // Same field as User Management (employeeDetails.workLocation); only sent when edited here.
      if (locationTouched) payload.workLocation = workLocation;
      const res = await updateUserFull(user._id, payload);
      dispatch(notifySuccess(`${fullName(user)} updated.`));
      if (res.hierarchyWarning) dispatch(notifyError(res.hierarchyWarning));
      onSaved?.();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setSaving(false);
    }
  };

  // Keep an unresolved current value selectable so the Select never shows an out-of-range value.
  const currentMissing = jobRoleId && !jobRoles.some((r) => String(r._id) === String(jobRoleId));

  return (
    <FormDialog
      open={open} onClose={onClose} onSubmit={submit} loading={saving}
      title="Change Role & Reporting Manager" subtitle={user ? fullName(user) : ''} formId="assign-role-form"
    >
      <div className="grid grid-cols-1 gap-4 pt-1">
        <TextField
          select label="Role" value={jobRoleId}
          onChange={(e) => setJobRoleId(e.target.value)}
          helperText="Job roles come from Setup → Roles. Reporting lines below define the actual hierarchy."
          fullWidth
        >
          <MenuItem value="">No role</MenuItem>
          {currentMissing && <MenuItem value={jobRoleId}>{user?.jobRole?.name || 'Current role'}</MenuItem>}
          {jobRoles.map((r) => <MenuItem key={r._id} value={r._id}>{r.name}</MenuItem>)}
        </TextField>

        {isAdminUser ? (
          <p className="text-sm text-muted">Admins are the top of the hierarchy and have no reporting manager.</p>
        ) : (
          <TextField
            select label="Reporting manager" value={managerId} onChange={(e) => setManagerId(e.target.value)}
            fullWidth disabled={loadingManagers}
            helperText={managerOptions.length === 0 && !loadingManagers
              ? (inactiveEligible.length > 0
                ? `No ACTIVE user at the required level. Inactive: ${inactiveEligible.join(', ')} — activate the account (Edit → Active account) to select them.`
                : 'No valid manager exists for this role yet (a BDM reports to an ASM, ASM to an RSM, RSM to a ZSM, ZSM to an Admin).')
              : 'Only active users in the level directly above this role are listed.'}
          >
            <MenuItem value="">— Unchanged / none —</MenuItem>
            {managerOptions.map((m) => (
              <MenuItem key={m._id} value={m._id}>
                {m.name} ({m.roleName || 'No role'}{m.employeeId ? ` · ${m.employeeId}` : ''})
              </MenuItem>
            ))}
          </TextField>
        )}

        <TextField
          label="Work Location" value={workLocation} fullWidth placeholder="e.g. Hyderabad"
          onChange={(e) => { setWorkLocation(e.target.value); setLocationTouched(true); }}
          helperText="The employee's current work location. Leave empty to clear it."
          inputProps={{ maxLength: 120 }}
        />

        <FormControlLabel control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />} label="Active account" />
      </div>
    </FormDialog>
  );
}
