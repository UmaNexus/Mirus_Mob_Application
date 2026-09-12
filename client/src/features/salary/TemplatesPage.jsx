import { useState } from 'react';
import { useDispatch } from 'react-redux';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import { Plus, Pencil, Power, Trash2, SlidersHorizontal } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import TemplateDialog from './TemplateDialog.jsx';
import LetterTemplatesSection from './LetterTemplatesSection.jsx';
import CFTemplatesSection from './CFTemplatesSection.jsx';
import JobRolesSection from './JobRolesSection.jsx';
import DepartmentsSection from './DepartmentsSection.jsx';
import useAsync from '../../hooks/useAsync.js';
import { listTemplates, deactivateTemplate, deleteInactiveTemplate } from '../../api/salary.js';
import { CALC_TYPES } from '../../config/constants.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const typeLabel = (t) => CALC_TYPES.find((c) => c.value === t)?.label || t;
const factorLabel = (row) => {
  if (row.calculationType === 'balance_of_ctc') return 'Balance';
  if (row.calculationType === 'fixed') {
    const rupees = Number(row.valueFactor || 0) / 100;
    return `₹${rupees.toLocaleString('en-IN')}`;
  }
  return `${row.valueFactor}%`;
};

export default function TemplatesPage() {
  const dispatch = useDispatch();
  const [tab, setTab] = useState(0);
  const { data: templates, loading, reload } = useAsync(() => listTemplates(), []);
  const [dialog, setDialog] = useState({ open: false, template: null });
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const onDeactivate = async () => {
    setBusy(true);
    try {
      await deactivateTemplate(deactivateTarget._id);
      dispatch(notifySuccess('Template deactivated.'));
      setDeactivateTarget(null);
      reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    setBusy(true);
    try {
      await deleteInactiveTemplate(deleteTarget._id);
      dispatch(notifySuccess('Inactive template deleted.'));
      setDeleteTarget(null);
      reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Setup Templates"
        subtitle="Salary models, job titles, departments, HR letter templates and C&F agreement templates"
        actions={tab === 0 ? <Button onClick={() => setDialog({ open: true, template: null })}><Plus size={16} /> New Salary Model</Button> : null}
      />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Salary Structures" sx={{ textTransform: 'none', fontWeight: 600 }} />
        <Tab label="Roles" sx={{ textTransform: 'none', fontWeight: 600 }} />
        <Tab label="Departments" sx={{ textTransform: 'none', fontWeight: 600 }} />
        <Tab label="Letter Templates" sx={{ textTransform: 'none', fontWeight: 600 }} />
        <Tab label="C&F Templates" sx={{ textTransform: 'none', fontWeight: 600 }} />
      </Tabs>

      {tab === 4 ? (
        <CFTemplatesSection />
      ) : tab === 3 ? (
        <LetterTemplatesSection />
      ) : tab === 2 ? (
        <DepartmentsSection />
      ) : tab === 1 ? (
        <JobRolesSection />
      ) : loading ? (
        <div className="flex justify-center py-20"><Spinner size={32} className="text-primary-600" /></div>
      ) : !templates?.length ? (
        <Card><EmptyState icon={SlidersHorizontal} title="No salary models yet" message="Create your first reusable salary structure to assign to employees." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {templates.map((t) => (
            <Card key={t._id}>
              <CardBody>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-ink">{t.name}</h3>
                    {t.description && <p className="text-sm text-muted">{t.description}</p>}
                  </div>
                  <StatusBadge status={t.isActive ? 'active' : 'inactive'} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary-700">Earnings</p>
                    <ul className="space-y-1 text-sm">
                      {t.earningsStructure.map((e) => (
                        <li key={e.key} className="flex justify-between gap-2">
                          <span className="text-muted">{e.label}</span>
                          <span className="text-ink">{factorLabel(e)} <span className="text-muted">· {typeLabel(e.calculationType)}</span></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-danger">Deductions</p>
                    <ul className="space-y-1 text-sm">
                      {t.deductionsStructure.map((d) => (
                        <li key={d.key} className="flex justify-between gap-2">
                          <span className="text-muted">{d.label}</span>
                          <span className="text-ink">{factorLabel(d)} <span className="text-muted">· {typeLabel(d.calculationType)}</span></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-2 border-t border-line pt-3">
                  <Button variant="secondary" size="sm" onClick={() => setDialog({ open: true, template: t })}><Pencil size={14} /> Edit</Button>
                  {t.isActive ? (
                    <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDeactivateTarget(t)}>
                      <Power size={14} /> Deactivate
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDeleteTarget(t)}>
                      <Trash2 size={14} /> Delete
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <TemplateDialog open={dialog.open} template={dialog.template} onClose={() => setDialog({ open: false, template: null })} onSaved={reload} />
      <ConfirmDialog
        open={Boolean(deactivateTarget)} onClose={() => setDeactivateTarget(null)} onConfirm={onDeactivate} loading={busy}
        title="Deactivate template?" confirmLabel="Deactivate"
        message="It will no longer be selectable for new assignments. Deactivation is blocked if any employee still has this template assigned — reassign them first."
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={onDelete} loading={busy}
        title="Delete inactive template?" confirmLabel="Delete permanently"
        message={deleteTarget
          ? `"${deleteTarget.name}" will be permanently removed. This cannot be undone. Delete is blocked if any employee still has this template assigned.`
          : ''}
      />
    </div>
  );
}
