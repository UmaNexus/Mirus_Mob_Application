import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import { Plus, Trash2, ArrowLeft, ArrowRight, CheckCircle2, Upload, FileText } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { getOnboardingStatus, savePersonal, saveFamily, saveContact, saveExperience, saveBank } from '../../api/onboarding.js';
import { uploadDocument } from '../../api/documents.js';
import { rupeesToPaisa } from '../../lib/money.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const STEPS = ['Personal', 'Family', 'Contact', 'Previous Employer', 'Bank'];
const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const RELATIONS = ['Father', 'Mother', 'Spouse', 'Sibling', 'Child', 'Other'];
const stageToStep = { personal: 0, family: 1, contact: 2, experience: 3, bank: 4, completed: 4 };

/** Build personal PATCH body — omit blank optional enums so validation/save succeed. */
const personalPayload = (p) => {
  const body = {
    firstName: p.firstName?.trim(),
    lastName: p.lastName?.trim(),
    dateOfBirth: p.dateOfBirth,
    gender: p.gender,
    maritalStatus: p.maritalStatus || 'Single'
  };
  if (p.bloodGroup) body.bloodGroup = p.bloodGroup;
  return body;
};

const emptyEmployer = () => ({
  employerName: '',
  designation: '',
  fromDate: '',
  toDate: '',
  lastDrawnCTCRupees: '',
  reasonForLeaving: '',
  offerLetterFileUrl: '',
  offerLetterName: '',
  payslipFileUrls: ['', '', ''],
  payslipNames: ['', '', ''],
  serviceOrFnfFileUrl: '',
  serviceOrFnfName: ''
});

function FileSlot({ label, fileName, uploading, onPick }) {
  return (
    <div className="rounded-md border border-line bg-surface-muted/40 px-3 py-2">
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <div className="flex items-center gap-2">
        <label className="btn-secondary btn-sm cursor-pointer">
          <Upload size={14} />
          {uploading ? 'Uploading…' : 'Choose PDF'}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onPick(f);
            }}
          />
        </label>
        {fileName ? (
          <span className="inline-flex items-center gap-1 truncate text-xs text-ink">
            <FileText size={14} className="shrink-0 text-primary-600" />
            {fileName}
          </span>
        ) : (
          <span className="text-xs text-muted">No file selected</span>
        )}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState(null);

  const [personal, setPersonal] = useState({ firstName: '', lastName: '', dateOfBirth: '', gender: '', bloodGroup: '', maritalStatus: 'Single' });
  const [family, setFamily] = useState([{ name: '', relationship: 'Father', dependent: false, contactNumber: '' }]);
  const [contact, setContact] = useState({ personalMobile: '', emergencyContactName: '', emergencyContactRelation: '', emergencyContactPhone: '', presentAddress: { street: '', city: '', state: '', zipCode: '', country: 'India' }, sameAsPresent: true, permanentAddress: { street: '', city: '', state: '', zipCode: '', country: 'India' } });
  const [notApplicable, setNotApplicable] = useState(false);
  const [employers, setEmployers] = useState([emptyEmployer()]);
  const [bank, setBank] = useState({ accountHolderName: '', accountNumber: '', bankName: '', ifscCode: '', panNumber: '', uanNumber: '' });

  useEffect(() => {
    getOnboardingStatus()
      .then((s) => {
        setActive(stageToStep[s.stage] ?? 0);
        setNotApplicable(Boolean(s.previousEmployerNotApplicable));
      })
      .catch(() => {});
  }, []);

  const next = () => setActive((a) => Math.min(a + 1, STEPS.length - 1));
  const back = () => setActive((a) => Math.max(a - 1, 0));

  const run = async (fn, after) => {
    setSaving(true);
    try { await fn(); dispatch(notifySuccess('Saved.')); after?.(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setSaving(false); }
  };

  const addr = (which) => (k) => (e) => setContact({ ...contact, [which]: { ...contact[which], [k]: e.target.value } });

  const updateEmployer = (i, patch) => {
    setEmployers((list) => list.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };

  const uploadEmployerDoc = async (i, kind, file, payslipIndex = null) => {
    const key = payslipIndex != null ? `${i}-payslip-${payslipIndex}` : `${i}-${kind}`;
    setUploadingKey(key);
    try {
      const employerLabel = employers[i]?.employerName || 'Previous employer';
      let documentType = 'Other';
      let documentName = file.name;
      let documentNumber = 'NA';
      if (kind === 'offer') {
        documentType = 'PreviousOfferLetter';
        documentName = `Offer letter - ${employerLabel}`;
        documentNumber = `PREV-OFFER-${i + 1}`;
      } else if (kind === 'payslip') {
        documentType = 'Payslip';
        documentName = `Payslip ${payslipIndex + 1} - ${employerLabel}`;
        documentNumber = `PREV-PAYSLIP-${i + 1}-${payslipIndex + 1}`;
      } else if (kind === 'service') {
        documentType = 'ServiceOrFnfLetter';
        documentName = `Service/FNF - ${employerLabel}`;
        documentNumber = `PREV-SERVICE-${i + 1}`;
      }
      const res = await uploadDocument({ file, documentType, documentName, documentNumber });
      const fileUrl = res.document?.fileUrl;
      if (!fileUrl) throw new Error('Upload failed');
      setEmployers((list) => list.map((row, idx) => {
        if (idx !== i) return row;
        if (kind === 'offer') return { ...row, offerLetterFileUrl: fileUrl, offerLetterName: file.name };
        if (kind === 'service') return { ...row, serviceOrFnfFileUrl: fileUrl, serviceOrFnfName: file.name };
        if (kind === 'payslip') {
          const urls = [...row.payslipFileUrls];
          const names = [...row.payslipNames];
          urls[payslipIndex] = fileUrl;
          names[payslipIndex] = file.name;
          return { ...row, payslipFileUrls: urls, payslipNames: names };
        }
        return row;
      }));
      dispatch(notifySuccess('Document uploaded.'));
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Upload failed'));
    } finally {
      setUploadingKey(null);
    }
  };

  const submitExperience = () => {
    if (notApplicable) {
      return run(() => saveExperience({ notApplicable: true, experienceHistory: [] }), next);
    }
    for (const row of employers) {
      if (!row.employerName.trim()) {
        dispatch(notifyError('Employer name is required'));
        return;
      }
      if (!row.offerLetterFileUrl) {
        dispatch(notifyError('Upload previous employer offer letter'));
        return;
      }
      if (row.payslipFileUrls.filter(Boolean).length < 3) {
        dispatch(notifyError('Upload 3 previous employer payslips'));
        return;
      }
      if (!row.serviceOrFnfFileUrl) {
        dispatch(notifyError('Upload service letter or FNF document'));
        return;
      }
    }
    const experienceHistory = employers.map((row) => ({
      employerName: row.employerName.trim(),
      designation: row.designation.trim() || undefined,
      fromDate: row.fromDate || undefined,
      toDate: row.toDate || undefined,
      lastDrawnCTC: row.lastDrawnCTCRupees !== '' ? rupeesToPaisa(row.lastDrawnCTCRupees) : undefined,
      reasonForLeaving: row.reasonForLeaving.trim() || undefined,
      offerLetterFileUrl: row.offerLetterFileUrl,
      payslipFileUrls: row.payslipFileUrls.filter(Boolean).slice(0, 3),
      serviceOrFnfFileUrl: row.serviceOrFnfFileUrl
    }));
    return run(() => saveExperience({ notApplicable: false, experienceHistory }), next);
  };

  return (
    <div>
      <PageHeader title="Onboarding Wizard" subtitle="Complete your employee profile" />

      <Card>
        <CardBody>
          <Stepper activeStep={active} alternativeLabel sx={{ mb: 4 }}>
            {STEPS.map((s) => <Step key={s}><StepLabel>{s}</StepLabel></Step>)}
          </Stepper>

          {/* Step 1: Personal */}
          {active === 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="First Name" value={personal.firstName} onChange={(e) => setPersonal({ ...personal, firstName: e.target.value })} fullWidth />
              <TextField label="Last Name" value={personal.lastName} onChange={(e) => setPersonal({ ...personal, lastName: e.target.value })} fullWidth />
              <TextField label="Date of Birth" type="date" value={personal.dateOfBirth} onChange={(e) => setPersonal({ ...personal, dateOfBirth: e.target.value })} fullWidth InputLabelProps={{ shrink: true }} />
              <TextField label="Gender" select value={personal.gender} onChange={(e) => setPersonal({ ...personal, gender: e.target.value })} fullWidth>
                {GENDERS.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
              </TextField>
              <TextField label="Blood Group (optional)" select value={personal.bloodGroup} onChange={(e) => setPersonal({ ...personal, bloodGroup: e.target.value })} fullWidth>
                <MenuItem value="">—</MenuItem>
                {BLOOD_GROUPS.map((b) => <MenuItem key={b} value={b}>{b}</MenuItem>)}
              </TextField>
              <TextField label="Marital Status" select value={personal.maritalStatus} onChange={(e) => setPersonal({ ...personal, maritalStatus: e.target.value })} fullWidth>
                {['Single', 'Married', 'Divorced', 'Widowed'].map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </TextField>
            </div>
          )}

          {/* Step 2: Family */}
          {active === 1 && (
            <div className="space-y-3">
              {family.map((m, i) => (
                <div key={i} className="grid grid-cols-12 items-center gap-2">
                  <TextField className="col-span-4" size="small" label="Name" value={m.name} onChange={(e) => setFamily(family.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} />
                  <TextField className="col-span-3" size="small" select label="Relationship" value={m.relationship} onChange={(e) => setFamily(family.map((x, idx) => idx === i ? { ...x, relationship: e.target.value } : x))}>
                    {RELATIONS.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                  </TextField>
                  <TextField className="col-span-3" size="small" label="Contact" value={m.contactNumber} onChange={(e) => setFamily(family.map((x, idx) => idx === i ? { ...x, contactNumber: e.target.value } : x))} />
                  <FormControlLabel className="col-span-1" control={<Checkbox size="small" checked={m.dependent} onChange={(e) => setFamily(family.map((x, idx) => idx === i ? { ...x, dependent: e.target.checked } : x))} />} label="Dep." />
                  <IconButton className="col-span-1" size="small" color="error" onClick={() => setFamily(family.filter((_, idx) => idx !== i))}><Trash2 size={16} /></IconButton>
                </div>
              ))}
              <button type="button" className="btn-secondary btn-sm" onClick={() => setFamily([...family, { name: '', relationship: 'Other', dependent: false, contactNumber: '' }])}><Plus size={14} /> Add Member</button>
            </div>
          )}

          {/* Step 3: Contact */}
          {active === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField label="Personal Mobile" value={contact.personalMobile} onChange={(e) => setContact({ ...contact, personalMobile: e.target.value })} fullWidth />
                <TextField label="Emergency Contact Name" value={contact.emergencyContactName} onChange={(e) => setContact({ ...contact, emergencyContactName: e.target.value })} fullWidth />
                <TextField label="Emergency Relation" value={contact.emergencyContactRelation} onChange={(e) => setContact({ ...contact, emergencyContactRelation: e.target.value })} fullWidth />
                <TextField label="Emergency Phone" value={contact.emergencyContactPhone} onChange={(e) => setContact({ ...contact, emergencyContactPhone: e.target.value })} fullWidth />
              </div>
              <p className="text-sm font-semibold text-ink">Present Address</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField label="Street" value={contact.presentAddress.street} onChange={addr('presentAddress')('street')} fullWidth />
                <TextField label="City" value={contact.presentAddress.city} onChange={addr('presentAddress')('city')} fullWidth />
                <TextField label="State" value={contact.presentAddress.state} onChange={addr('presentAddress')('state')} fullWidth />
                <TextField label="Zip Code" value={contact.presentAddress.zipCode} onChange={addr('presentAddress')('zipCode')} fullWidth />
              </div>
              <FormControlLabel control={<Checkbox checked={contact.sameAsPresent} onChange={(e) => setContact({ ...contact, sameAsPresent: e.target.checked })} />} label="Permanent address same as present" />
              {!contact.sameAsPresent && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField label="Permanent Street" value={contact.permanentAddress.street} onChange={addr('permanentAddress')('street')} fullWidth />
                  <TextField label="Permanent City" value={contact.permanentAddress.city} onChange={addr('permanentAddress')('city')} fullWidth />
                  <TextField label="Permanent State" value={contact.permanentAddress.state} onChange={addr('permanentAddress')('state')} fullWidth />
                  <TextField label="Permanent Zip" value={contact.permanentAddress.zipCode} onChange={addr('permanentAddress')('zipCode')} fullWidth />
                </div>
              )}
            </div>
          )}

          {/* Step 4: Previous Employer */}
          {active === 3 && (
            <div className="space-y-4">
              <FormControlLabel
                control={(
                  <Checkbox
                    checked={notApplicable}
                    onChange={(e) => setNotApplicable(e.target.checked)}
                  />
                )}
                label="Not applicable — I have no previous employer (fresher)"
              />

              {!notApplicable && (
                <div className="space-y-6">
                  <p className="text-sm text-muted">
                    Provide previous employer details and upload offer letter, last 3 payslips, and service letter or FNF.
                  </p>
                  {employers.map((row, i) => (
                    <div key={i} className="space-y-3 rounded-lg border border-line p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-ink">Employer {i + 1}</p>
                        {employers.length > 1 && (
                          <IconButton size="small" color="error" onClick={() => setEmployers(employers.filter((_, idx) => idx !== i))}>
                            <Trash2 size={16} />
                          </IconButton>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <TextField label="Employer Name" value={row.employerName} onChange={(e) => updateEmployer(i, { employerName: e.target.value })} fullWidth required />
                        <TextField label="Designation" value={row.designation} onChange={(e) => updateEmployer(i, { designation: e.target.value })} fullWidth />
                        <TextField label="From" type="date" value={row.fromDate} onChange={(e) => updateEmployer(i, { fromDate: e.target.value })} fullWidth InputLabelProps={{ shrink: true }} />
                        <TextField label="To" type="date" value={row.toDate} onChange={(e) => updateEmployer(i, { toDate: e.target.value })} fullWidth InputLabelProps={{ shrink: true }} />
                        <TextField label="Last Drawn CTC (₹ / year)" type="number" value={row.lastDrawnCTCRupees} onChange={(e) => updateEmployer(i, { lastDrawnCTCRupees: e.target.value })} fullWidth />
                        <TextField label="Reason for Leaving" value={row.reasonForLeaving} onChange={(e) => updateEmployer(i, { reasonForLeaving: e.target.value })} fullWidth />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <FileSlot
                          label="Previous employer offer letter (PDF)"
                          fileName={row.offerLetterName}
                          uploading={uploadingKey === `${i}-offer`}
                          onPick={(f) => uploadEmployerDoc(i, 'offer', f)}
                        />
                        <FileSlot
                          label="Service letter or FNF (PDF)"
                          fileName={row.serviceOrFnfName}
                          uploading={uploadingKey === `${i}-service`}
                          onPick={(f) => uploadEmployerDoc(i, 'service', f)}
                        />
                        {[0, 1, 2].map((p) => (
                          <FileSlot
                            key={p}
                            label={`Payslip ${p + 1} of 3 (PDF)`}
                            fileName={row.payslipNames[p]}
                            uploading={uploadingKey === `${i}-payslip-${p}`}
                            onPick={(f) => uploadEmployerDoc(i, 'payslip', f, p)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setEmployers([...employers, emptyEmployer()])}>
                    <Plus size={14} /> Add Another Employer
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Bank */}
          {active === 4 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Account Holder Name" value={bank.accountHolderName} onChange={(e) => setBank({ ...bank, accountHolderName: e.target.value })} fullWidth />
              <TextField label="Account Number" value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} fullWidth />
              <TextField label="Bank Name" value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} fullWidth />
              <TextField label="IFSC Code" value={bank.ifscCode} onChange={(e) => setBank({ ...bank, ifscCode: e.target.value })} fullWidth />
              <TextField label="PAN Number" value={bank.panNumber} onChange={(e) => setBank({ ...bank, panNumber: e.target.value })} fullWidth />
              <TextField label="UAN Number" value={bank.uanNumber} onChange={(e) => setBank({ ...bank, uanNumber: e.target.value })} fullWidth />
            </div>
          )}

          {/* Footer nav */}
          <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
            <Button variant="ghost" onClick={back} disabled={active === 0}><ArrowLeft size={16} /> Back</Button>
            {active === 0 && (
              <Button
                loading={saving}
                onClick={() => {
                  if (!personal.firstName?.trim() || !personal.lastName?.trim() || !personal.dateOfBirth || !personal.gender) {
                    dispatch(notifyError('Please fill first name, last name, date of birth, and gender.'));
                    return;
                  }
                  run(() => savePersonal(personalPayload(personal)), next);
                }}
              >
                Save & Proceed <ArrowRight size={16} />
              </Button>
            )}
            {active === 1 && <Button loading={saving} onClick={() => run(() => saveFamily(family), next)}>Save & Proceed <ArrowRight size={16} /></Button>}
            {active === 2 && <Button loading={saving} onClick={() => run(() => saveContact(contact), next)}>Save & Proceed <ArrowRight size={16} /></Button>}
            {active === 3 && <Button loading={saving || Boolean(uploadingKey)} onClick={submitExperience}>Save & Proceed <ArrowRight size={16} /></Button>}
            {active === 4 && <Button loading={saving} onClick={() => run(() => saveBank(bank), () => { navigate('/me'); })}><CheckCircle2 size={16} /> Finish Onboarding</Button>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
