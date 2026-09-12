import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { Users, FileClock, ReceiptText, FileCheck2, TrendingUp, Activity } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Card, CardHeader, CardBody } from '../components/ui/Card.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import useAsync from '../hooks/useAsync.js';
import { getDashboardStats, getDashboardActivity } from '../api/dashboard.js';
import { selectUser } from '../features/auth/authSlice.js';
import { MONTHS } from '../config/constants.js';

function StatCard({ icon: Icon, label, value, sub, tone, to, loading }) {
  const inner = (
    <CardBody className="flex items-center gap-4">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon size={22} /></div>
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        {loading ? <Spinner size={20} className="mt-1 text-slate-300" /> : <p className="text-2xl font-bold text-ink">{value}</p>}
        {sub && <p className="text-xs text-muted">{sub}</p>}
      </div>
    </CardBody>
  );
  return to ? <Card className="transition hover:border-primary-300 hover:shadow-elevated"><Link to={to}>{inner}</Link></Card> : <Card>{inner}</Card>;
}

export default function Dashboard() {
  const user = useSelector(selectUser);
  const firstName = user?.personalDetails?.firstName || 'Admin';
  const { data: stats, loading } = useAsync(() => getDashboardStats(), []);
  const { data: activity, loading: activityLoading } = useAsync(() => getDashboardActivity(8), []);

  const period = stats?.slipsPeriod ? `${MONTHS.find((m) => m.value === stats.slipsPeriod.month)?.label} ${stats.slipsPeriod.year}` : '';

  const cards = [
    { icon: Users, label: 'Total Employees', value: stats?.totalEmployees ?? 0, tone: 'text-primary-600 bg-primary-50' },
    { icon: FileClock, label: 'Pending Offers', value: stats?.pendingOffers ?? 0, tone: 'text-warning bg-warning-soft', to: '/offers' },
    { icon: FileCheck2, label: 'Pending Verifications', value: stats?.pendingVerifications ?? 0, tone: 'text-info bg-info-soft', to: '/verifications' },
    { icon: ReceiptText, label: 'Slips Issued', value: stats?.slipsIssued ?? 0, sub: period, tone: 'text-success bg-success-soft', to: '/payslips' }
  ];

  return (
    <div>
      <PageHeader title={`Welcome back, ${firstName}!`} subtitle="Here's what's happening across your organization." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => <StatCard key={c.label} {...c} loading={loading} />)}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent Activity" subtitle="Latest events across the portal" />
          <CardBody className="p-0">
            {activityLoading ? (
              <div className="flex justify-center py-10"><Spinner size={28} className="text-primary-600" /></div>
            ) : !activity?.length ? (
              <EmptyState
                icon={Activity}
                title="No activity yet"
                message="Actions like sending offers, issuing payslips, and verifying documents will appear here."
              />
            ) : (
              <ul className="divide-y divide-line">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-5 py-4">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.tone || 'bg-primary-500'}`} />
                    <div className="flex-1">
                      <p className="text-sm text-ink">{a.message}</p>
                      <p className="text-xs text-muted">
                        {a.time}{a.actorName ? ` · ${a.actorName}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="At a glance" />
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-muted"><TrendingUp size={16} className="text-success" /> Offer acceptance rate</span>
              <span className="text-lg font-bold text-ink">{loading ? '—' : `${stats?.acceptanceRate ?? 0}%`}</span>
            </div>
            {[
              { label: 'Create Offer Letter', to: '/offers' },
              { label: 'Review Documents', to: '/verifications' },
              { label: 'Generate Payslips', to: '/payslips' }
            ].map((l) => (
              <Link key={l.to} to={l.to} className="block rounded-lg border border-line px-4 py-3 text-sm font-medium text-ink hover:border-primary-300 hover:bg-primary-50/40">
                {l.label}
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
