import { useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import { Plus, Trash2, Briefcase } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import useAsync from '../../hooks/useAsync.js';
import { listJobRoles, createJobRole, deleteJobRole } from '../../api/jobRoles.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

export default function JobRolesSection() {
  const dispatch = useDispatch();
  const { data: roles, loading, reload } = useAsync(() => listJobRoles({ all: true }), []);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const active = (roles || []).filter((r) => r.active !== false);

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return dispatch(notifyError('Role name is required.'));
    setBusy(true);
    try {
      await createJobRole({ name: name.trim() });
      dispatch(notifySuccess('Role added.'));
      setName('');
      reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Could not add role.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget?._id) return;
    setDeleting(true);
    try {
      await deleteJobRole(deleteTarget._id);
      dispatch(notifySuccess('Role removed.'));
      setDeleteTarget(null);
      reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Could not remove role.'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size={32} className="text-primary-600" /></div>;
  }

  return (
    <div>
      <Card className="mb-4">
        <CardBody>
          <h3 className="mb-1 text-base font-semibold text-ink">Job titles (Roles)</h3>
          <p className="mb-4 text-sm text-muted">
            Designations used on employee profiles, offers, and promotions. These are not login permission roles.
          </p>
          <form onSubmit={add} className="flex flex-wrap items-end gap-2">
            <TextField
              size="small"
              label="Role name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Area development manager"
              sx={{ minWidth: 280 }}
            />
            <Button type="submit" loading={busy}><Plus size={14} /> Add role</Button>
          </form>
        </CardBody>
      </Card>

      {!active.length ? (
        <Card>
          <EmptyState
            icon={Briefcase}
            title="No roles yet"
            message="Add job titles your organization uses for designations."
          />
        </Card>
      ) : (
        <Card>
          <CardBody>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="pb-2">Name</th>
                  <th className="pb-2 text-right" />
                </tr>
              </thead>
              <tbody>
                {active.map((r) => (
                  <tr key={r._id} className="border-t border-line">
                    <td className="py-2 font-medium text-ink">{r.name}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        className="btn-ghost p-1 text-danger"
                        onClick={() => setDeleteTarget(r)}
                        aria-label={`Remove ${r.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        loading={deleting}
        title="Remove role?"
        confirmLabel="Remove"
        message={deleteTarget ? `"${deleteTarget.name}" will be deactivated and hidden from designation lists.` : ''}
      />
    </div>
  );
}
