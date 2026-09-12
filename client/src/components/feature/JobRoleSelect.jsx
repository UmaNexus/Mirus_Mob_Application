import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import useAsync from '../../hooks/useAsync.js';
import { listJobRoles } from '../../api/jobRoles.js';

/**
 * Designation / job-title select from Setup → Roles catalog.
 * Stores the role name string (matches User.employeeDetails.designation).
 */
export default function JobRoleSelect({
  value = '',
  onChange,
  label = 'Designation',
  required = false,
  size = 'small',
  fullWidth = true,
  allowEmpty = true,
  emptyLabel = '—',
  className
}) {
  const { data: roles, loading, reload } = useAsync(() => listJobRoles(), []);

  return (
    <TextField
      select
      size={size}
      fullWidth={fullWidth}
      required={required}
      label={label}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      className={className}
      disabled={loading}
      SelectProps={{ onOpen: () => { reload(); } }}
    >
      {allowEmpty && <MenuItem value="">{emptyLabel}</MenuItem>}
      {(roles || []).map((r) => (
        <MenuItem key={r._id} value={r.name}>{r.name}</MenuItem>
      ))}
      {value && !(roles || []).some((r) => r.name === value) && (
        <MenuItem value={value}>{value}</MenuItem>
      )}
    </TextField>
  );
}
