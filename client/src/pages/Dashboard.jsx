import { useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  Users, FileClock, ReceiptText, FileCheck2, TrendingUp, Activity,
  AlertTriangle, ArrowRight, Check, X, CalendarDays
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Card, CardHeader, CardBody } from '../components/ui/Card.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import useAsync from '../hooks/useAsync.js';
import { getDashboardStats, getDashboardActivity } from '../api/dashboard.js';
import { listLeaves, decideLeave, listHolidays } from '../api/attendance.js';
import { notifySuccess, notifyError } from '../features/ui/toastSlice.js';
import { selectUser } from '../features/auth/authSlice.js';
import { MONTHS } from '../config/constants.js';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

const userDisplayName = (u) => {
  if (!u) return '—';
  if (typeof u === 'string') return u;
  const n = `${u.personalDetails?.firstName || ''} ${u.personalDetails?.lastName || ''}`.trim();
  return n || u.email || '—';
};

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
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const firstName = user?.personalDetails?.firstName || 'Admin';
  const { data: stats, loading } = useAsync(() => getDashboardStats(), []);
  const { data: activity, loading: activityLoading } = useAsync(() => getDashboardActivity(8), []);
  const { data: leavesData, loading: leavesLoading, reload: reloadLeaves } = useAsync(
    () => listLeaves({ status: 'Pending' }),
    []
  );
  const currentYear = new Date().getFullYear();
  const { data: holidaysData, loading: holidaysLoading } = useAsync(
    () => listHolidays({ year: currentYear }),
    [currentYear]
  );
  const [busyLeaveId, setBusyLeaveId] = useState(null);

  const pendingLeaves = leavesData || [];
  const holidays = holidaysData || [];

  const parsedHolidays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return holidays.map((h) => {
      let d;
      if (h.dateKey) {
        const [y, m, day] = h.dateKey.split('-').map(Number);
        d = new Date(y, m - 1, day);
      } else {
        d = new Date(h.date);
      }
      const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return { ...h, dateObj: d, diffDays };
    });
  }, [holidays]);

  const upcomingCount = parsedHolidays.filter((h) => h.diffDays >= 0).length;

  const handleDecideLeave = async (id, nextStatus) => {
    setBusyLeaveId(id);
    try {
      await decideLeave(id, { status: nextStatus });
      dispatch(notifySuccess(`Leave request ${nextStatus.toLowerCase()}.`));
      await reloadLeaves();
    } catch (err) {
      dispatch(notifyError(err.uiMessage || `Failed to ${nextStatus.toLowerCase()} leave request.`));
    } finally {
      setBusyLeaveId(null);
    }
  };

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

      {/* Grid: Leave Applications Alert on the left, Holiday Calendar right beside it */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Leave Applications Alert Section */}
        <Card className="border-amber-200 bg-white shadow-card overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50/60 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">Leave Applications Alert</h3>
                    {!leavesLoading && (
                      pendingLeaves.length > 0 ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                          {pendingLeaves.length} Pending
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                          0 Pending
                        </span>
                      )
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    Review pending employee leave requests requiring management approval
                  </p>
                </div>
              </div>

              <Link
                to="/attendance-admin#leaves-register"
                className="btn btn-secondary btn-sm inline-flex items-center gap-1.5 border-line bg-white hover:border-primary-400 hover:text-primary-700 shadow-sm"
              >
                <span>More</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            <CardBody className="p-0">
              {leavesLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner size={24} className="text-primary-600" />
                </div>
              ) : !pendingLeaves.length ? (
                <div className="flex items-center justify-between px-5 py-6 text-sm text-muted">
                  <span>No pending leave applications. All leave requests have been processed.</span>
                  <Link
                    to="/attendance-admin#leaves-register"
                    className="text-xs font-medium text-primary-600 hover:underline"
                  >
                    Go to Leaves register &rarr;
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
                  <table className="w-full min-w-[500px] text-sm">
                    <thead>
                      <tr className="sticky top-0 border-b border-line bg-slate-50 text-left text-xs font-medium text-muted">
                        <th className="px-4 py-2.5">Employee</th>
                        <th className="px-3 py-2.5">Type</th>
                        <th className="px-3 py-2.5">Dates</th>
                        <th className="px-2 py-2.5">Days</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5">Reason</th>
                        <th className="px-4 py-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {pendingLeaves.slice(0, 5).map((l) => (
                        <tr key={l._id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-ink leading-tight">{userDisplayName(l.userId)}</p>
                            <p className="text-[11px] text-muted">
                              {l.userId?.employeeDetails?.employeeId || l.userId?.email || '—'}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 font-medium text-ink text-xs">{l.type}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-muted text-xs">{fmt(l.fromDate)}</td>
                          <td className="px-2 py-2.5 font-semibold text-ink text-xs">{l.days}</td>
                          <td className="px-3 py-2.5">
                            <StatusBadge status={l.status} />
                          </td>
                          <td className="px-3 py-2.5 text-muted max-w-[140px] truncate text-xs" title={l.reason || ''}>
                            {l.reason || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              className="btn-ghost p-1 text-success hover:bg-emerald-50 rounded-md disabled:opacity-40"
                              disabled={busyLeaveId === l._id}
                              onClick={() => handleDecideLeave(l._id, 'Approved')}
                              title="Approve"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              type="button"
                              className="btn-ghost p-1 text-danger hover:bg-rose-50 rounded-md disabled:opacity-40 ml-1"
                              disabled={busyLeaveId === l._id}
                              onClick={() => handleDecideLeave(l._id, 'Rejected')}
                              title="Reject"
                            >
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </div>

          {pendingLeaves.length > 0 && (
            <div className="flex items-center justify-between border-t border-line bg-slate-50/50 px-5 py-2.5 text-xs text-muted">
              <span>
                {pendingLeaves.length > 5 ? `Showing 5 of ${pendingLeaves.length} pending requests` : `${pendingLeaves.length} pending leave requests`}
              </span>
              <Link
                to="/attendance-admin#leaves-register"
                className="font-semibold text-primary-600 hover:text-primary-700"
              >
                View in Leaves register &rarr;
              </Link>
            </div>
          )}
        </Card>

        {/* Holiday Calendar Card */}
        <Card className="border-line bg-white shadow-card overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-slate-50/60 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                  <CalendarDays size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">Holiday Calendar</h3>
                    {!holidaysLoading && (
                      <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700">
                        {currentYear}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    Official holidays and observed off-days
                  </p>
                </div>
              </div>

              <Link
                to="/attendance-admin#holiday-calendar"
                className="btn btn-secondary btn-sm inline-flex items-center gap-1.5 border-line bg-white hover:border-primary-400 hover:text-primary-700 shadow-sm"
              >
                <span>More</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            <CardBody className="p-0">
              {holidaysLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner size={24} className="text-primary-600" />
                </div>
              ) : !parsedHolidays.length ? (
                <div className="flex items-center justify-between px-5 py-6 text-sm text-muted">
                  <span>No holidays scheduled for {currentYear}.</span>
                  <Link
                    to="/attendance-admin#holiday-calendar"
                    className="text-xs font-medium text-primary-600 hover:underline"
                  >
                    Add holiday &rarr;
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-line max-h-[340px] overflow-y-auto">
                  {parsedHolidays.map((h) => {
                    const monthShort = h.dateObj.toLocaleDateString('en-IN', { month: 'short' });
                    const dayNum = h.dateObj.getDate();
                    const weekday = h.dateObj.toLocaleDateString('en-IN', { weekday: 'short' });
                    const isUpcoming = h.diffDays >= 0;
                    const isToday = h.diffDays === 0;

                    return (
                      <div key={h._id} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-slate-50/60 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border border-primary-200 bg-primary-50/70 text-center">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary-700 leading-none">
                              {monthShort}
                            </span>
                            <span className="text-sm font-extrabold text-ink leading-tight">
                              {dayNum}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink flex items-center gap-2 truncate">
                              <span className="truncate">{h.name}</span>
                              {h.optional && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 shrink-0">
                                  Optional
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted">
                              {weekday}, {fmt(h.date)}
                            </p>
                          </div>
                        </div>

                        <div className="text-right whitespace-nowrap shrink-0">
                          {isToday ? (
                            <span className="badge-success text-xs px-2.5 py-0.5 font-semibold">
                              Today
                            </span>
                          ) : isUpcoming ? (
                            <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                              {h.diffDays === 1 ? 'Tomorrow' : `In ${h.diffDays} days`}
                            </span>
                          ) : (
                            <span className="badge-neutral text-xs px-2 py-0.5">
                              Passed
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </div>

          {parsedHolidays.length > 0 && (
            <div className="flex items-center justify-between border-t border-line bg-slate-50/50 px-5 py-2.5 text-xs text-muted">
              <span>{upcomingCount} upcoming {upcomingCount === 1 ? 'holiday' : 'holidays'}</span>
              <Link
                to="/attendance-admin#holiday-calendar"
                className="font-semibold text-primary-600 hover:text-primary-700"
              >
                View full calendar &rarr;
              </Link>
            </div>
          )}
        </Card>
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
              { label: 'Generate Payslips', to: '/payslips' },
              { label: 'Leaves Register', to: '/attendance-admin#leaves-register' }
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
