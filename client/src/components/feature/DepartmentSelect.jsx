import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import useAsync from '../../hooks/useAsync.js';
import { listDepartments } from '../../api/departments.js';

/**
 * Department select from Setup → Departments catalog.
 * Stores the department name string (matches User/Offer.department).
 * Refetches when the menu opens so newly added departments appear.
 */
export default function DepartmentSelect({
  value = '',
  onChange,
  label = 'Department',
  required = false,
  size = 'small',
  fullWidth = true,
  allowEmpty = true,
  emptyLabel = '—',
  className
}) {
  const { data: departments, loading, reload } = useAsync(() => listDepartments(), []);

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
      {(departments || []).map((d) => (
        <MenuItem key={d._id} value={d.name}>{d.name}</MenuItem>
      ))}
      {value && !(departments || []).some((d) => d.name === value) && (
        <MenuItem value={value}>{value}</MenuItem>
      )}
    </TextField>
  );
}
