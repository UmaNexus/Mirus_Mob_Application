import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import { ArrowLeft, User } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import useAsync from '../../hooks/useAsync.js';
import { getEmployeeOverview } from '../../api/users.js';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const rupees = (p) => (p == null ? '—' : `INR ${(p / 100).toLocaleString('en-IN')}`);
const name = (u) => `${u?.personalDetails?.firstName || ''} ${u?.personalDetails?.lastName || ''}`.trim();

// Small definition-list row.
const Row = ({ label, value }) => (
  <div className="flex justify-between gap-3 border-b border-line py-2 text-sm last:border-0">
    <span className="text-muted">{label}</span><span className="text-right font-medium text-ink">{value ?? '—'}</span>
  </div>
);

const Section = ({ title, children }) => (
  <Card className="mb-4"><CardBody><h3 className="mb-3 text-base font-semibold text-ink">{title}</h3>{children}</CardBody></Card>
);

const Table = ({ head, rows, render, empty }) => (
  <table className="w-full text-sm">
    <thead><tr className="text-left text-muted">{head.map((h) => <th key={h} className="pb-2">{h}</th>)}</tr></thead>
    <tbody>
      {rows?.length ? rows.map(render) : <tr><td colSpan={head.length} className="py-4 text-center text-muted">{empty}</td></tr>}
    </tbody>
  </table>
);

const TABS = ['Personal', 'Corporate', 'Education & Experience', 'Documents', 'Attendance & Leave', 'Performance', 'Assets', 'Payroll', 'Exit'];

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const { data, loading, error } = useAsync(() => getEmployeeOverview(id), [id]);
  const [tab, setTab] = useState(0);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} className="text-primary-600" /></div>;
  if (error) return <Card><CardBody><p className="text-danger">{error}</p></CardBody></Card>;

  const { user, compensation, payslips, attendance, leaves, performance, assets, documents, exit } = data;
  const ed = user.employeeDetails || {};
  const pd = user.personalDetails || {};
  const ci = user.contactInfo || {};

  return (
    <div>
      <Link to="/users" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary-600"><ArrowLeft size={15} /> Back to directory</Link>
      <PageHeader
        title={name(user) || user.email}
        subtitle={`${ed.designation || '—'} · ${ed.department || '—'} · ${ed.employeeId || 'No ID'}`}
        actions={<StatusBadge status={user.isActive ? 'active' : 'inactive'} />}
      />

      <div className="mb-4 flex items-center gap-4">
        <Avatar src={pd.profilePictureUrl ? `/${pd.profilePictureUrl}` : null} name={name(user)} size={56} />
        <div>
          <p className="font-semibold text-ink">{name(user)}</p>
          <p className="text-sm text-muted">{user.email} · {user.role}</p>
        </div>
      </div>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        {TABS.map((t) => <Tab key={t} label={t} sx={{ textTransform: 'none', fontWeight: 600 }} />)}
      </Tabs>

      {/* Personal */}
      {tab === 0 && (
        <>
          <Section title="Personal details">
            <Row label="Full name" value={name(user)} />
            <Row label="Date of birth" value={fmt(pd.dateOfBirth)} />
            <Row label="Gender" value={pd.gender} />
            <Row label="Blood group" value={pd.bloodGroup} />
            <Row label="Marital status" value={pd.maritalStatus} />
            <Row label="Mobile" value={ci.personalMobile} />
            <Row label="Email" value={user.email} />
          </Section>
          <Section title="Contact & emergency">
            <Row label="Present address" value={[ci.presentAddress?.street, ci.presentAddress?.city, ci.presentAddress?.state, ci.presentAddress?.zipCode].filter(Boolean).join(', ')} />
            <Row label="Permanent address" value={[ci.permanentAddress?.street, ci.permanentAddress?.city, ci.permanentAddress?.state, ci.permanentAddress?.zipCode].filter(Boolean).join(', ')} />
            <Row label="Emergency contact" value={ci.emergencyContactName ? `${ci.emergencyContactName} (${ci.emergencyContactRelation}) · ${ci.emergencyContactPhone}` : '—'} />
          </Section>
          <Section title="Family">
            <Table head={['Name', 'Relationship', 'DOB']} rows={user.familyDetails} empty="No family members recorded."
              render={(f, i) => <tr key={i} className="border-t border-line"><td className="py-2">{f.name}</td><td className="py-2">{f.relationship}</td><td className="py-2">{fmt(f.dateOfBirth)}</td></tr>} />
          </Section>
        </>
      )}

      {/* Corporate */}
      {tab === 1 && (
        <Section title="Employment details">
          <Row label="Employee ID" value={ed.employeeId} />
          <Row label="Designation" value={ed.designation} />
          <Row label="Department" value={ed.department} />
          <Row label="Employment type" value={ed.employmentType} />
          <Row label="Work location" value={ed.workLocation} />
          <Row label="Date of joining" value={fmt(ed.dateOfJoining)} />
          <Row label="PAN" value={ed.panNumber} />
          <Row label="UAN" value={ed.uanNumber} />
          <Row label="ESI number" value={ed.esiNumber} />
          <Row label="Professional Tax no." value={ed.professionalTaxNumber} />
          <Row label="Bank account" value={ed.bankDetails?.accountNumber ? `${ed.bankDetails.bankName} · ${ed.bankDetails.accountNumber} · ${ed.bankDetails.ifscCode}` : '—'} />
          <Row label="UPI" value={ed.bankDetails?.upiId} />
        </Section>
      )}

      {/* Education & Experience */}
      {tab === 2 && (
        <>
          <Section title="Education">
            <Table head={['Level', 'Institution', 'Year', 'Grade']} rows={user.educationHistory} empty="No education records."
              render={(e) => <tr key={e._id} className="border-t border-line"><td className="py-2">{e.level}</td><td className="py-2">{e.institution}</td><td className="py-2">{e.yearOfPassing || '—'}</td><td className="py-2">{e.gradeOrPercentage || '—'}</td></tr>} />
          </Section>
          <Section title="Previous experience">
            {user.previousEmployerNotApplicable ? (
              <p className="text-sm text-muted">Not applicable (no previous employer).</p>
            ) : (
              <Table
                head={['Employer', 'Designation', 'From', 'To', 'Docs']}
                rows={user.experienceHistory}
                empty="No experience records."
                render={(x) => (
                  <tr key={x._id} className="border-t border-line">
                    <td className="py-2">{x.employerName}</td>
                    <td className="py-2">{x.designation || '—'}</td>
                    <td className="py-2">{fmt(x.fromDate)}</td>
                    <td className="py-2">{fmt(x.toDate)}</td>
                    <td className="py-2 text-xs text-muted">
                      {[
                        x.offerLetterFileUrl && 'Offer',
                        (x.payslipFileUrls || []).length ? `${x.payslipFileUrls.length} payslips` : null,
                        x.serviceOrFnfFileUrl && 'Service/FNF'
                      ].filter(Boolean).join(' · ') || '—'}
                    </td>
                  </tr>
                )}
              />
            )}
          </Section>
          <Section title="References">
            <Table head={['Name', 'Company', 'Phone']} rows={user.references} empty="No references."
              render={(r) => <tr key={r._id} className="border-t border-line"><td className="py-2">{r.name}</td><td className="py-2">{r.company || '—'}</td><td className="py-2">{r.phone || '—'}</td></tr>} />
          </Section>
        </>
      )}

      {/* Documents */}
      {tab === 3 && (
        <>
          <Section title="Uploaded documents (vault)">
            <Table head={['Type', 'Number', 'Status']} rows={user.uploadedDocuments} empty="No documents uploaded."
              render={(d, i) => <tr key={i} className="border-t border-line"><td className="py-2">{d.documentType}</td><td className="py-2">{d.documentNumber}</td><td className="py-2"><StatusBadge status={d.verificationStatus} /></td></tr>} />
          </Section>
          <Section title="Company-issued documents">
            <Table head={['Title', 'Status', 'Acknowledged']} rows={documents.generated} empty="None issued."
              render={(d) => <tr key={d._id} className="border-t border-line"><td className="py-2">{d.title}</td><td className="py-2"><StatusBadge status={d.status} /></td><td className="py-2">{fmt(d.acknowledgedAt)}</td></tr>} />
          </Section>
          <Section title="Assigned documents (Form 16 etc.)">
            <Table head={['Document', 'Section', 'Mode', 'Status']} rows={documents.uploaded} empty="None assigned."
              render={(r) => <tr key={r._id} className="border-t border-line"><td className="py-2">{r.documentTypeId?.name || '—'}</td><td className="py-2">{r.section}</td><td className="py-2 capitalize">{r.accessMode}</td><td className="py-2"><StatusBadge status={r.status} /></td></tr>} />
          </Section>
        </>
      )}

      {/* Attendance & Leave */}
      {tab === 4 && (
        <>
          <Section title="Recent attendance">
            <Table head={['Date', 'Status', 'Overtime']} rows={attendance} empty="No attendance records."
              render={(a) => <tr key={a._id} className="border-t border-line"><td className="py-2">{fmt(a.date)}</td><td className="py-2"><StatusBadge status={a.status} /></td><td className="py-2">{a.isOvertime ? `${a.overtimeHours}h` : '—'}</td></tr>} />
          </Section>
          <Section title="Leave requests">
            <Table head={['Type', 'From', 'To', 'Days', 'Status']} rows={leaves} empty="No leave requests."
              render={(l) => <tr key={l._id} className="border-t border-line"><td className="py-2">{l.type}</td><td className="py-2">{fmt(l.fromDate)}</td><td className="py-2">{fmt(l.toDate)}</td><td className="py-2">{l.days}</td><td className="py-2"><StatusBadge status={l.status} /></td></tr>} />
          </Section>
        </>
      )}

      {/* Performance */}
      {tab === 5 && (
        <>
          <Section title="Performance reviews">
            <Table head={['Period', 'Rating', 'Status']} rows={performance.reviews} empty="No reviews."
              render={(r) => <tr key={r._id} className="border-t border-line"><td className="py-2">{r.period}</td><td className="py-2">{r.overallRating}/5</td><td className="py-2"><StatusBadge status={r.status === 'Published' ? 'active' : 'pending'} label={r.status} /></td></tr>} />
          </Section>
          <Section title="Appraisals & promotions">
            <Table head={['Effective', 'New designation', 'New CTC']} rows={performance.appraisals} empty="No appraisals."
              render={(a) => <tr key={a._id} className="border-t border-line"><td className="py-2">{fmt(a.effectiveDate)}</td><td className="py-2">{a.newDesignation || '—'}</td><td className="py-2">{rupees(a.newCTC)}</td></tr>} />
          </Section>
          <Section title="Incentives">
            <Table head={['Period', 'Amount', 'Status']} rows={performance.incentives} empty="No incentives."
              render={(i) => <tr key={i._id} className="border-t border-line"><td className="py-2">{i.period}</td><td className="py-2">{rupees(i.amount)}</td><td className="py-2"><StatusBadge status={i.status} /></td></tr>} />
          </Section>
          <Section title="Training records">
            <Table head={['Title', 'Provider', 'Status']} rows={performance.trainingRecords} empty="No training records."
              render={(t) => <tr key={t._id} className="border-t border-line"><td className="py-2">{t.title}</td><td className="py-2">{t.provider || '—'}</td><td className="py-2"><StatusBadge status={t.status} /></td></tr>} />
          </Section>
        </>
      )}

      {/* Assets */}
      {tab === 6 && (
        <Section title="Assigned assets">
          <Table head={['Tag', 'Type', 'Issued', 'Status']} rows={assets} empty="No assets assigned."
            render={(a) => <tr key={a._id} className="border-t border-line"><td className="py-2">{a.tag}</td><td className="py-2">{a.type}</td><td className="py-2">{fmt(a.issuedAt)}</td><td className="py-2"><StatusBadge status={a.status === 'Assigned' ? 'processing' : 'active'} label={a.status} /></td></tr>} />
        </Section>
      )}

      {/* Payroll */}
      {tab === 7 && (
        <>
          <Section title="Compensation">
            <Row label="Annual CTC" value={rupees(compensation?.annualCTC)} />
            <Row label="Monthly gross" value={rupees(compensation?.frozenMonthlyBreakdown?.grossEarnings)} />
            <Row label="Monthly net" value={rupees(compensation?.frozenMonthlyBreakdown?.netTakeHome)} />
          </Section>
          <Section title="Payslips">
            <Table head={['Period', 'Net pay', 'Status']} rows={payslips} empty="No payslips."
              render={(p) => <tr key={p._id} className="border-t border-line"><td className="py-2">{p.month}/{p.year}</td><td className="py-2">{rupees(p.financialSummary?.netPay)}</td><td className="py-2"><StatusBadge status={p.paymentStatus} /></td></tr>} />
          </Section>
        </>
      )}

      {/* Exit */}
      {tab === 8 && (
        <Section title="Exit / offboarding">
          {exit ? (
            <>
              <Row label="Resignation date" value={fmt(exit.resignationDate)} />
              <Row label="Last working day" value={fmt(exit.lastWorkingDay)} />
              <Row label="Reason" value={exit.reason} />
              <Row label="Status" value={exit.status} />
              <Row label="F&F" value={`${rupees(exit.fnfSettlement?.amount)} · ${exit.fnfSettlement?.status || 'Pending'}`} />
              <Row label="Exit interview" value={exit.exitInterview?.conductedAt ? fmt(exit.exitInterview.conductedAt) : 'Not conducted'} />
            </>
          ) : <p className="py-2 text-sm text-muted">No exit record — employee is active.</p>}
        </Section>
      )}
    </div>
  );
}
