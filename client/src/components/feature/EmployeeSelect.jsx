import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import useAsync from '../../hooks/useAsync.js';
import { listUsers } from '../../api/users.js';

const fullName = (u) => `${u.personalDetails?.firstName || ''} ${u.personalDetails?.lastName || ''}`.trim() || u.email;

/**
 * Select of provisioned employees only (accepted offer + credentials issued).
 * Value/onChange work on the user id.
 */
export default function EmployeeSelect({
  value,
  onChange,
  label = 'Employee',
  size = 'small',
  roles,
  emptyLabel = 'Select…',
  /** When true (default), only users with an assigned employeeId are listed. */
  employeesOnly = true
}) {
  const { data } = useAsync(
    () => listUsers({
      limit: 200,
      status: 'active',
      ...(employeesOnly ? { employeesOnly: true } : {}),
      ...(roles ? { role: Array.isArray(roles) ? roles[0] : roles } : { role: 'employee' })
    }),
    [employeesOnly, Array.isArray(roles) ? roles.join(',') : roles]
  );
  const users = (data?.data || []).filter((u) => (roles ? roles.includes(u.role) : true));
  return (
    <TextField select fullWidth size={size} label={label} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <MenuItem value="">{emptyLabel}</MenuItem>
      {users.map((u) => (
        <MenuItem key={u._id} value={u._id}>
          {fullName(u)}{u.employeeDetails?.employeeId ? ` (${u.employeeDetails.employeeId})` : ''}
        </MenuItem>
      ))}
    </TextField>
  );
}
