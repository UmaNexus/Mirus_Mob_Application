import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import FormDialog from '../../components/ui/FormDialog.jsx';
import JobRoleSelect from '../../components/feature/JobRoleSelect.jsx';
import DepartmentSelect from '../../components/feature/DepartmentSelect.jsx';
import { updateUser } from '../../api/users.js';
import { ROLES, fullName } from '../../config/constants.js';
import { notifySuccess, notifyError } from '../../features/ui/toastSlice.js';

export default function EditUserDialog({ open, user, onClose, onSaved }) {
  const dispatch = useDispatch();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [roleTouched, setRoleTouched] = useState(false);

  useEffect(() => {
    if (!user) return;
    setRoleTouched(false);
    setForm({
      firstName: user.personalDetails?.firstName || '',
      lastName: user.personalDetails?.lastName || '',
      phone: user.contactInfo?.personalMobile || '',
      role: user.role || 'employee',
      department: user.employeeDetails?.department || '',
      workLocation: user.employeeDetails?.workLocation || '',
      jobRoleId: user.employeeDetails?.jobRole?._id || (typeof user.employeeDetails?.jobRole === 'string' ? user.employeeDetails.jobRole : '') || '',
      employeeId: user.employeeDetails?.employeeId || '',
      isActive: Boolean(user.isActive)
    });
  }, [user]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // The role is sent as an id (chosen from the existing job roles); the server sets designation and
      // employeeDetails.jobRole together. Only sent when the admin actually changed the selection.
      const { jobRoleId, ...rest } = form;
      const payload = { ...rest };
      if (!payload.department) delete payload.department;
      if (roleTouched) payload.jobRoleId = jobRoleId || null;
      await updateUser(user._id, payload);
      dispatch(notifySuccess('User updated.'));
      onSaved?.();
      onClose();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open} onClose={onClose} onSubmit={submit} loading={saving}
      title="Edit User" subtitle={user ? fullName(user) : ''} formId="edit-user-form"
    >
      <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
        <TextField label="First Name" value={form.firstName || ''} onChange={set('firstName')} fullWidth required />
        <TextField label="Last Name" value={form.lastName || ''} onChange={set('lastName')} fullWidth required />
        <TextField label="Phone" value={form.phone || ''} onChange={set('phone')} fullWidth />
        <TextField label="Employee ID" value={form.employeeId || ''} onChange={set('employeeId')} fullWidth />
        <TextField label="Access role" value={form.role || ''} onChange={set('role')} select fullWidth helperText="Login permission (admin / hr / employee)">
          {ROLES.map((r) => <MenuItem key={r} value={r} sx={{ textTransform: 'capitalize' }}>{r}</MenuItem>)}
        </TextField>
        <DepartmentSelect
          label="Department"
          value={form.department || ''}
          onChange={(v) => setForm({ ...form, department: v })}
          size="medium"
        />
        <TextField
          label="Work Location" value={form.workLocation || ''} onChange={set('workLocation')} fullWidth
          placeholder="e.g. Hyderabad" helperText="The employee's current work location. Leave empty to clear it."
          inputProps={{ maxLength: 120 }}
        />
        <JobRoleSelect
          label="Role"
          byId
          value={form.jobRoleId || ''}
          onChange={(id) => { setRoleTouched(true); setForm({ ...form, jobRoleId: id }); }}
          helperText={!form.jobRoleId && user?.employeeDetails?.designation ? `Designation "${user.employeeDetails.designation}" is not linked to a role yet — select the role to link it.` : undefined}
          className="sm:col-span-2"
          size="medium"
        />
      </div>
      <FormControlLabel
        sx={{ mt: 1 }}
        control={<Switch checked={Boolean(form.isActive)} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />}
        label="Active account"
      />
    </FormDialog>
  );
}
