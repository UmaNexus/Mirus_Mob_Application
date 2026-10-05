import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import useAsync from '../../hooks/useAsync.js';
import { listJobRoles } from '../../api/jobRoles.js';

/**
 * Job role select from the company's EXISTING job roles (GET /job-roles; Setup → Roles).
 *  - default: the value is the role NAME (used by list filters / letter forms).
 *  - `byId`: the value is the JobRole _id and `onChange(id, role)` also receives the role. Use this
 *    wherever a role is ASSIGNED (offers, user edit): the server validates the id and writes
 *    designation + employeeDetails.jobRole together — the client never decides authorization.
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
  byId = false,
  helperText,
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
      onChange={(e) => {
        const v = e.target.value;
        if (byId) onChange?.(v, (roles || []).find((r) => String(r._id) === String(v)) || null);
        else onChange?.(v);
      }}
      helperText={helperText}
      className={className}
      disabled={loading}
      SelectProps={{ onOpen: () => { reload(); } }}
    >
      {allowEmpty && <MenuItem value="">{emptyLabel}</MenuItem>}
      {(roles || []).map((r) => (
        <MenuItem key={r._id} value={byId ? r._id : r.name}>{r.name}</MenuItem>
      ))}
      {!byId && value && !(roles || []).some((r) => r.name === value) && (
        <MenuItem value={value}>{value}</MenuItem>
      )}
    </TextField>
  );
}
