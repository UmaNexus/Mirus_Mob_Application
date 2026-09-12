import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { X, Mail, FileText } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import CurrencyField from '../../components/ui/CurrencyField.jsx';
import JobRoleSelect from '../../components/feature/JobRoleSelect.jsx';
import DepartmentSelect from '../../components/feature/DepartmentSelect.jsx';
import { createOffer, sendOfferEmail, offerPdfUrl } from '../../api/offers.js';
import { listTemplates } from '../../api/salary.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const blank = {
  candidateEmail: '', fullName: '', position: '', department: '',
  joiningDate: '', offerDate: '', templateId: '', annualCTC: '',
  phone: '', city: '', location: ''
};

export default function CreateOfferDialog({ open, onClose, onSaved }) {
  const dispatch = useDispatch();
  const [step, setStep] = useState('form'); // form | preview
  const [form, setForm] = useState(blank);
  const [templates, setTemplates] = useState([]);
  const [saving, setSaving] = useState(false);
  const [offerId, setOfferId] = useState(null);
  const [email, setEmail] = useState({ subject: '', body: '' });

  useEffect(() => {
    if (!open) return;
    setForm(blank);
    setStep('form');
    setOfferId(null);
    setEmail({ subject: '', body: '' });
    listTemplates({ activeOnly: true }).then(setTemplates).catch(() => {});
  }, [open]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const generatePreview = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, annualCTC: Number(form.annualCTC), sendEmail: false };
      if (!payload.offerDate) delete payload.offerDate;
      if (!payload.phone) delete payload.phone;
      if (!payload.city) delete payload.city;
      if (!payload.location) delete payload.location;
      const res = await createOffer(payload);
      setOfferId(res.offer._id);
      setEmail({
        subject: res.emailPreview?.subject || '',
        body: res.emailPreview?.body || ''
      });
      setStep('preview');
      dispatch(notifySuccess('Offer PDF generated — review the email before sending.'));
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setSaving(false);
    }
  };

  const send = async () => {
    if (!offerId) return;
    setSaving(true);
    try {
      const res = await sendOfferEmail(offerId, { subject: email.subject, body: email.body });
      dispatch(notifySuccess('Offer emailed to the candidate with PDF attached.'));
      onSaved?.(res);
      onClose();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth={step === 'preview' ? 'md' : 'sm'} fullWidth
      slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogTitle sx={{ pr: 6, fontWeight: 700 }}>
        {step === 'form' ? 'Create Offer Letter' : 'Preview email & PDF'}
        <p className="mt-0.5 text-sm font-normal text-muted">
          {step === 'form'
            ? 'Generate the offer, then preview the email before sending'
            : 'Edit subject/body if needed, then send with the PDF attached'}
        </p>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }} size="small"><X size={18} /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {step === 'form' ? (
          <form id="create-offer-form" onSubmit={generatePreview}>
            <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
              <TextField label="Full Name" value={form.fullName} onChange={set('fullName')} fullWidth required />
              <TextField label="Candidate Email" type="email" value={form.candidateEmail} onChange={set('candidateEmail')} fullWidth required />
              <TextField label="Phone" value={form.phone} onChange={set('phone')} fullWidth />
              <TextField label="City / Address" value={form.city} onChange={set('city')} fullWidth placeholder="e.g. Hyderabad, PIN Code: 500090" />
              <JobRoleSelect
                label="Position"
                value={form.position}
                onChange={(v) => setForm({ ...form, position: v })}
                required
                size="medium"
              />
              <TextField
                label="Job Location / Reporting area"
                value={form.location}
                onChange={set('location')}
                fullWidth
                placeholder="e.g. Nizamabad"
                helperText="Used as reporting area on the appointment letter. Leave blank to omit that line."
              />
              <DepartmentSelect
                label="Department"
                value={form.department}
                onChange={(v) => setForm({ ...form, department: v })}
                required
                allowEmpty={false}
                size="medium"
              />
              <TextField label="Joining Date" type="date" value={form.joiningDate} onChange={set('joiningDate')} fullWidth required InputLabelProps={{ shrink: true }} />
              <TextField label="Offer Date" type="date" value={form.offerDate} onChange={set('offerDate')} fullWidth InputLabelProps={{ shrink: true }} helperText="Defaults to today" />
              <TextField label="Salary Template" value={form.templateId} onChange={set('templateId')} select fullWidth required>
                {templates.map((t) => <MenuItem key={t._id} value={t._id}>{t.name}</MenuItem>)}
              </TextField>
              <CurrencyField value={form.annualCTC} onChange={(v) => setForm({ ...form, annualCTC: v })} required />
            </div>
          </form>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="rounded-lg border border-line bg-surface p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Mail size={15} className="text-primary-600" /> Email preview
              </p>
              <p className="mb-3 text-xs text-muted">
                To: <span className="font-medium text-ink">{form.candidateEmail}</span>
                {' · '}PDF will be attached
              </p>
              <div className="space-y-3">
                <TextField
                  size="small" fullWidth label="Subject"
                  value={email.subject}
                  onChange={(e) => setEmail({ ...email, subject: e.target.value })}
                />
                <TextField
                  size="small" fullWidth multiline minRows={8} label="Body"
                  value={email.body}
                  onChange={(e) => setEmail({ ...email, body: e.target.value })}
                />
              </div>
            </div>
            {offerId && (
              <div className="rounded-lg border border-line overflow-hidden">
                <div className="flex items-center gap-1.5 border-b border-line bg-surface px-3 py-2 text-sm font-semibold text-ink">
                  <FileText size={15} className="text-primary-600" /> Offer PDF
                  <a className="ml-auto text-xs font-medium text-primary-600 hover:underline" href={offerPdfUrl(offerId)} target="_blank" rel="noreferrer">
                    Open in new tab
                  </a>
                </div>
                <iframe title="Offer PDF preview" src={offerPdfUrl(offerId)} className="h-[420px] w-full bg-white" />
              </div>
            )}
          </div>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        {step === 'form' ? (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" form="create-offer-form" loading={saving}>Generate &amp; Preview</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Close without sending</Button>
            <Button onClick={send} loading={saving}>Send email</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
