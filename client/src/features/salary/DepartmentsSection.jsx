import { useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import { Plus, Trash2, Building2 } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import useAsync from '../../hooks/useAsync.js';
import { listDepartments, createDepartment, deleteDepartment } from '../../api/departments.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

export default function DepartmentsSection() {
  const dispatch = useDispatch();
  const { data: departments, loading, reload } = useAsync(() => listDepartments({ all: true }), []);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const active = (departments || []).filter((d) => d.active !== false);

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return dispatch(notifyError('Department name is required.'));
    setBusy(true);
    try {
      await createDepartment({ name: name.trim() });
      dispatch(notifySuccess('Department added.'));
      setName('');
      reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Could not add department.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget?._id) return;
    setDeleting(true);
    try {
      await deleteDepartment(deleteTarget._id);
      dispatch(notifySuccess('Department removed.'));
      setDeleteTarget(null);
      reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Could not remove department.'));
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
          <h3 className="mb-1 text-base font-semibold text-ink">Departments</h3>
          <p className="mb-4 text-sm text-muted">
            Departments used on employee profiles and offer letters. Add or remove entries to update all department dropdowns.
          </p>
          <form onSubmit={add} className="flex flex-wrap items-end gap-2">
            <TextField
              size="small"
              label="Department name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Accounts"
              sx={{ minWidth: 280 }}
            />
            <Button type="submit" loading={busy}><Plus size={14} /> Add department</Button>
          </form>
        </CardBody>
      </Card>

      {!active.length ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="No departments yet"
            message="Add departments your organization uses on offers and employee profiles."
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
                {active.map((d) => (
                  <tr key={d._id} className="border-t border-line">
                    <td className="py-2 font-medium text-ink">{d.name}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        className="btn-ghost p-1 text-danger"
                        onClick={() => setDeleteTarget(d)}
                        aria-label={`Remove ${d.name}`}
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
        title="Remove department?"
        confirmLabel="Remove"
        message={deleteTarget ? `"${deleteTarget.name}" will be deactivated and hidden from department lists.` : ''}
      />
    </div>
  );
}
