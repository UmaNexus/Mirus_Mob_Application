import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormDialog from '../../components/ui/FormDialog.jsx';
import CurrencyField from '../../components/ui/CurrencyField.jsx';
import { listTemplates, assignSalary, getAssignment } from '../../api/salary.js';
import { fullName } from '../../config/constants.js';
import { formatINR, paisaToRupees } from '../../lib/money.js';
import { notifySuccess, notifyError } from '../../features/ui/toastSlice.js';

export default function AssignSalaryDialog({ open, user, onClose }) {
  const dispatch = useDispatch();
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [ctc, setCtc] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!open || !user) return;
    setPreview(null); setCtc(''); setTemplateId('');
    listTemplates({ activeOnly: true }).then(setTemplates).catch(() => {});
    getAssignment(user._id)
      .then((a) => { if (a) { setTemplateId(a.templateId?._id || a.templateId); setCtc(paisaToRupees(a.annualCTC)); } })
      .catch(() => {}); // 404 = no existing assignment
  }, [open, user]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const assignment = await assignSalary({ userId: user._id, templateId, annualCTC: Number(ctc) });
      setPreview(assignment.frozenMonthlyBreakdown);
      dispatch(notifySuccess('Salary assigned and breakdown frozen.'));
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open} onClose={onClose} onSubmit={submit} loading={saving}
      title="Assign Salary" subtitle={user ? fullName(user) : ''} submitLabel="Compute & Save" formId="assign-salary-form"
    >
      <div className="space-y-4 pt-1">
        <TextField label="Salary Template" value={templateId} onChange={(e) => setTemplateId(e.target.value)} select fullWidth required>
          {templates.map((t) => <MenuItem key={t._id} value={t._id}>{t.name}</MenuItem>)}
        </TextField>
        <CurrencyField value={ctc} onChange={setCtc} required helperText="Enter the annual CTC in rupees" />

        {preview && (
          <div className="rounded-lg bg-primary-50 p-4 text-sm">
            <p className="mb-2 font-semibold text-primary-800">Frozen monthly breakdown</p>
            <div className="grid grid-cols-2 gap-y-1">
              <span className="text-muted">Gross Earnings</span><span className="text-right font-medium">{formatINR(preview.grossEarnings)}</span>
              <span className="text-muted">Total Deductions</span><span className="text-right font-medium">{formatINR(preview.totalDeductions)}</span>
              <span className="font-semibold text-ink">Net Take-Home</span><span className="text-right font-bold text-primary-700">{formatINR(preview.netTakeHome)}</span>
            </div>
          </div>
        )}
      </div>
    </FormDialog>
  );
}
