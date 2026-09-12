import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import ListItemIcon from '@mui/material/ListItemIcon';
import { Search, Pencil, Trash2, Wallet, RotateCcw, KeyRound, MoreVertical, Link2, Eye } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import DataGrid from '../../components/ui/DataGrid.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import TablePager from '../../components/ui/TablePager.jsx';
import EditUserDialog from './EditUserDialog.jsx';
import AssignSalaryDialog from './AssignSalaryDialog.jsx';
import { listUsers, deleteUser, permanentDeleteUser, restoreUser, generateCredentials, sendPasswordResetLink } from '../../api/users.js';
import JobRoleSelect from '../../components/feature/JobRoleSelect.jsx';
import DepartmentSelect from '../../components/feature/DepartmentSelect.jsx';
import { ROLES, fullName } from '../../config/constants.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const RoleChip = ({ value }) => <span className="badge-neutral capitalize">{value}</span>;

// Per-row action cluster: direct icons for common actions + an overflow menu
// for account/credential actions. Manages its own menu anchor state.
function RowActions({ row, onView, onEdit, onAssign, onDelete, onCreds, onReset, onRestore, onPermanentDelete }) {
  const [anchor, setAnchor] = useState(null);
  if (row.deletedAt) {
    return (
      <div className="flex h-full items-center gap-1">
        <Tooltip title="Restore"><button className="btn-ghost p-2" onClick={() => onRestore(row)}><RotateCcw size={16} /></button></Tooltip>
        <Tooltip title="Delete permanently"><button className="btn-ghost p-2 text-danger" onClick={() => onPermanentDelete(row)}><Trash2 size={16} /></button></Tooltip>
      </div>
    );
  }
  const pick = (fn) => () => { setAnchor(null); fn(row); };
  return (
    <div className="flex h-full items-center gap-1">
      <Tooltip title="View full details"><button className="btn-ghost p-2 text-primary-600" onClick={() => onView(row)}><Eye size={16} /></button></Tooltip>
      <Tooltip title="Edit"><button className="btn-ghost p-2" onClick={() => onEdit(row)}><Pencil size={16} /></button></Tooltip>
      <Tooltip title="Assign salary"><button className="btn-ghost p-2 text-primary-600" onClick={() => onAssign(row)}><Wallet size={16} /></button></Tooltip>
      <Tooltip title="Delete"><button className="btn-ghost p-2 text-danger" onClick={() => onDelete(row)}><Trash2 size={16} /></button></Tooltip>
      <Tooltip title="More"><button className="btn-ghost p-2" onClick={(e) => setAnchor(e.currentTarget)}><MoreVertical size={16} /></button></Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 240, borderRadius: 2 } } }}>
        <MenuItem onClick={pick(onCreds)}><ListItemIcon><KeyRound size={16} /></ListItemIcon>Generate login credentials</MenuItem>
        <MenuItem onClick={pick(onReset)}><ListItemIcon><Link2 size={16} /></ListItemIcon>Send password reset link</MenuItem>
      </Menu>
    </div>
  );
}

const NameCell = ({ data }) => (
  <div className="flex items-center gap-2.5">
    <Avatar src={data.personalDetails?.profilePictureUrl} name={fullName(data)} size={32} />
    <div className="leading-tight">
      <p className="font-medium text-ink">{fullName(data)}</p>
      <p className="text-xs text-muted">{data.email}</p>
    </div>
  </div>
);

const StatusCell = ({ data }) => {
  if (data.deletedAt) return <StatusBadge status="rejected" label="Deleted" />;
  return <StatusBadge status={data.isActive ? 'active' : 'inactive'} />;
};

export default function UsersPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    search: '', role: '', designation: '', status: '', department: '', includeDeleted: false
  });
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [resp, setResp] = useState({ data: [], pagination: { total: 0, pages: 1 } });
  const [loading, setLoading] = useState(true);

  const [editUser, setEditUser] = useState(null);
  const [assignUser, setAssignUser] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [permanentDeleting, setPermanentDeleting] = useState(false);
  const [credsTarget, setCredsTarget] = useState(null);
  const [credsBusy, setCredsBusy] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetBusy, setResetBusy] = useState(false);

  // Debounce the search box into filters.
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setFilters((f) => ({ ...f, search: searchInput })); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await listUsers({ ...filters, includeDeleted: filters.includeDeleted ? 'true' : undefined, page, limit });
      setResp(data);
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchUsers(); }, [filters, page, limit]);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteUser(deleteTarget._id);
      dispatch(notifySuccess('User soft-deleted.'));
      setDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setDeleting(false);
    }
  };

  const confirmPermanentDelete = async () => {
    setPermanentDeleting(true);
    try {
      await permanentDeleteUser(permanentDeleteTarget._id);
      dispatch(notifySuccess('User permanently deleted.'));
      setPermanentDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setPermanentDeleting(false);
    }
  };

  const onRestore = async (row) => {
    try {
      await restoreUser(row._id);
      dispatch(notifySuccess('User restored.'));
      fetchUsers();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    }
  };

  const confirmGenerateCreds = async () => {
    setCredsBusy(true);
    try {
      const res = await generateCredentials(credsTarget._id);
      const extra = res.tempPassword ? ` · temp password: ${res.tempPassword}` : '';
      dispatch(notifySuccess(`Credentials emailed. Employee ID ${res.employeeId}${extra}`));
      setCredsTarget(null);
      fetchUsers();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setCredsBusy(false);
    }
  };

  const confirmReset = async () => {
    setResetBusy(true);
    try {
      await sendPasswordResetLink(resetTarget._id);
      dispatch(notifySuccess(`Password reset link emailed to ${resetTarget.email}.`));
      setResetTarget(null);
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setResetBusy(false);
    }
  };

  const columnDefs = useMemo(() => [
    { headerName: 'ID', valueGetter: (p) => p.data.employeeDetails?.employeeId || '—', maxWidth: 130 },
    { headerName: 'Name', valueGetter: (p) => fullName(p.data), cellRenderer: NameCell, minWidth: 240, flex: 2 },
    { headerName: 'Department', valueGetter: (p) => p.data.employeeDetails?.department || '—' },
    { headerName: 'Role', valueGetter: (p) => p.data.employeeDetails?.designation || '—', maxWidth: 160 },
    { headerName: 'Access', field: 'role', cellRenderer: RoleChip, maxWidth: 120 },
    { headerName: 'Status', cellRenderer: StatusCell, filter: false, sortable: false, maxWidth: 150 },
    {
      headerName: 'Actions', filter: false, sortable: false, minWidth: 190, maxWidth: 210,
      cellRenderer: (p) => (
        <RowActions
          row={p.data}
          onView={(row) => navigate(`/users/${row._id}`)}
          onEdit={setEditUser} onAssign={setAssignUser} onDelete={setDeleteTarget}
          onCreds={setCredsTarget} onReset={setResetTarget} onRestore={onRestore}
          onPermanentDelete={setPermanentDeleteTarget}
        />
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  return (
    <div>
      <PageHeader title="User Management" subtitle={`${resp.pagination.total} users in the directory`} />

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-10" placeholder="Search by name, ID, email…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <JobRoleSelect
            label="Role"
            value={filters.designation}
            onChange={(v) => { setPage(1); setFilters({ ...filters, designation: v }); }}
            emptyLabel="All roles"
          />
          <TextField select size="small" label="Access" value={filters.role} onChange={(e) => { setPage(1); setFilters({ ...filters, role: e.target.value }); }}>
            <MenuItem value="">All access</MenuItem>
            {ROLES.map((r) => <MenuItem key={r} value={r} sx={{ textTransform: 'capitalize' }}>{r}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Status" value={filters.status} onChange={(e) => { setPage(1); setFilters({ ...filters, status: e.target.value }); }}>
            <MenuItem value="">All statuses</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
          </TextField>
          <DepartmentSelect
            label="Department"
            value={filters.department}
            onChange={(v) => { setPage(1); setFilters({ ...filters, department: v }); }}
            emptyLabel="All departments"
          />
        </div>
        <FormControlLabel
          sx={{ mt: 1 }}
          control={<Checkbox size="small" checked={filters.includeDeleted} onChange={(e) => { setPage(1); setFilters({ ...filters, includeDeleted: e.target.checked }); }} />}
          label={<span className="text-sm text-muted">Show soft-deleted users</span>}
        />
      </Card>

      <DataGrid rowData={resp.data} columnDefs={columnDefs} loading={loading} pagination={false} height={560} />

      <TablePager
        page={page}
        pages={resp.pagination.pages || 1}
        total={resp.pagination.total || 0}
        limit={limit}
        showingCount={resp.data.length}
        onPageChange={setPage}
        onLimitChange={(n) => { setLimit(n); setPage(1); }}
      />

      <EditUserDialog open={Boolean(editUser)} user={editUser} onClose={() => setEditUser(null)} onSaved={fetchUsers} />
      <AssignSalaryDialog open={Boolean(assignUser)} user={assignUser} onClose={() => setAssignUser(null)} />
      <ConfirmDialog
        open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} loading={deleting}
        title="Delete user?" confirmLabel="Delete"
        message={deleteTarget ? `${fullName(deleteTarget)} will be soft-deleted and hidden from the directory. You can restore them later.` : ''}
      />
      <ConfirmDialog
        open={Boolean(permanentDeleteTarget)} onClose={() => setPermanentDeleteTarget(null)} onConfirm={confirmPermanentDelete} loading={permanentDeleting}
        title="Permanently delete user?" confirmLabel="Delete forever"
        message={permanentDeleteTarget ? `${fullName(permanentDeleteTarget)} and their staging offers will be removed permanently. This cannot be undone. Blocked if payslips or an accepted offer exist.` : ''}
      />
      <ConfirmDialog
        open={Boolean(credsTarget)} onClose={() => setCredsTarget(null)} onConfirm={confirmGenerateCreds} loading={credsBusy}
        danger={false} title="Generate login credentials?" confirmLabel="Generate & email"
        message={credsTarget ? `This activates ${fullName(credsTarget)}, assigns an employee ID if missing, resets their password to a new temporary one, and emails the credentials to ${credsTarget.email}.` : ''}
      />
      <ConfirmDialog
        open={Boolean(resetTarget)} onClose={() => setResetTarget(null)} onConfirm={confirmReset} loading={resetBusy}
        danger={false} title="Send password reset link?" confirmLabel="Send link"
        message={resetTarget ? `${fullName(resetTarget)} will receive an email with a secure link to set a new password (valid 3 days).` : ''}
      />
    </div>
  );
}
