import { Link } from 'react-router-dom';
import LinearProgress from '@mui/material/LinearProgress';
import { Download, FileText, FolderLock, UserCog, Wallet, ArrowRight } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardHeader, CardBody } from '../../components/ui/Card.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import useAsync from '../../hooks/useAsync.js';
import { getHubOverview } from '../../api/selfService.js';
import { payslipPdfUrl } from '../../api/payslips.js';

const STAGE_PCT = { personal: 20, family: 35, contact: 50, experience: 70, bank: 90, completed: 100 };

export default function EmployeeHub() {
  const { data, loading } = useAsync(() => getHubOverview(), []);

  if (loading || !data) return <div className="flex justify-center py-20"><Spinner size={32} className="text-primary-600" /></div>;
  const { profile, onboarding, latestPayslip, documents } = data;
  const pct = STAGE_PCT[onboarding.stage] ?? 0;

  return (
    <div>
      <PageHeader title="My Workspace" subtitle="Your profile, payslips and documents at a glance" />

      {/* Identity card */}
      <Card className="mb-6 overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-primary-600 to-primary-800" />
        <CardBody className="pt-0">
          {/* Avatar overlaps the band; name + details sit on white below it */}
          <div className="flex items-start justify-between">
            <Avatar src={profile.avatarUrl} name={profile.fullName} size={88} className="-mt-12 ring-4 ring-white" />
            <Link to="/profile" className="btn-secondary mt-3"><UserCog size={16} /> Edit Profile</Link>
          </div>
          <div className="mt-3">
            <h2 className="text-xl font-bold text-ink">{profile.fullName}</h2>
            <p className="text-sm text-muted">{profile.designation || '—'} · {profile.department || '—'}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {profile.employeeId && <span className="badge-neutral">{profile.employeeId}</span>}
              <StatusBadge status={profile.status === 'Active Employee' ? 'active' : 'inactive'} label={profile.status} />
              {profile.reportingManager && <span className="text-xs text-muted">Reports to <span className="font-medium text-ink">{profile.reportingManager}</span></span>}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Onboarding progress (if incomplete) */}
      {onboarding.stage !== 'completed' && (
        <Card className="mb-6 border-warning/30 bg-warning-soft/40">
          <CardBody>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <p className="font-semibold text-ink">Complete your onboarding</p>
                <p className="text-sm text-muted">You're {pct}% done. Finish your profile to unlock all features.</p>
                <LinearProgress variant="determinate" value={pct} sx={{ mt: 1.5, height: 8, borderRadius: 4 }} />
              </div>
              <Link to="/onboarding" className="btn-primary">Continue <ArrowRight size={16} /></Link>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Latest payslip */}
        <Card className="lg:col-span-2">
          <CardHeader title="Latest Payslip" action={<Link to="/my-payslips" className="text-sm font-medium text-primary-600">View all →</Link>} />
          <CardBody>
            {latestPayslip ? (
              <div className="flex items-center justify-between rounded-lg bg-primary-50 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-600 text-white"><Wallet size={20} /></span>
                  <div>
                    <p className="font-semibold text-ink">{latestPayslip.period}</p>
                    <p className="text-sm text-muted">Net pay {latestPayslip.netPayDisplay}</p>
                  </div>
                </div>
                <a href={payslipPdfUrl(latestPayslip.id)} target="_blank" rel="noreferrer" className="btn-primary btn-sm"><Download size={15} /> Download</a>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted">No payslips issued yet.</p>
            )}
          </CardBody>
        </Card>

        {/* Documents summary */}
        <Card>
          <CardHeader title="Documents" action={<Link to="/documents" className="text-sm font-medium text-primary-600">Manage →</Link>} />
          <CardBody className="space-y-2">
            <Row icon={FileText} label="Total uploaded" value={documents.total} />
            <Row icon={FolderLock} label="Verified" value={documents.verified} tone="text-success" />
            <Row icon={FolderLock} label="Pending" value={documents.pending} tone="text-warning" />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

const Row = ({ icon: Icon, label, value, tone = 'text-primary-600' }) => (
  <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
    <span className="flex items-center gap-2 text-sm text-muted"><Icon size={16} className={tone} /> {label}</span>
    <span className="font-semibold text-ink">{value}</span>
  </div>
);
