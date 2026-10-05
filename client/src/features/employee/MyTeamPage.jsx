import { Users2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import useAsync from '../../hooks/useAsync.js';
import { getHubOverview } from '../../api/selfService.js';
import { roleLabelOf } from '../../config/roleLabel.js';

/** "Admin"/"Superadmin" HRMS role, or the JobRole name, or the free-text designation — whichever is the most specific real label available for this chain member. */
const roleLine = (member) => {
  if (member.role === 'admin' || member.role === 'superadmin') return 'Admin';
  const label = roleLabelOf({ roleName: member.roleName, jobRole: member.jobRole });
  if (label) return label;
  return member.designation || 'Employee';
};

/** Same minimal card the page always used for the single reporting manager — reused per level so a longer chain doesn't change the page's look, just its length. */
function ReportingCard({ label, name, subtitle, employeeId }) {
  return (
    <Card>
      <CardBody>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <div className="flex items-center gap-3">
          <Avatar name={name} size={48} />
          <div>
            <p className="font-semibold text-ink">{name}</p>
            <p className="text-sm text-muted">{subtitle}</p>
            {employeeId && <p className="text-xs text-muted">{employeeId}</p>}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export default function MyTeamPage() {
  const { data, loading } = useAsync(() => getHubOverview(), []);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} className="text-primary-600" /></div>;

  const profile = data?.profile;
  const chain = profile?.reportingChain || [];

  return (
    <div>
      <PageHeader title="My Team & Reporting" subtitle="Your reporting line" />

      {!profile ? (
        <Card><EmptyState icon={Users2} title="Unable to load your reporting chain" /></Card>
      ) : (
        <div className="space-y-4">
          {chain.length === 0 ? (
            <Card><EmptyState icon={Users2} title="No reporting manager assigned" message="Your reporting line will appear here once HR assigns a manager." /></Card>
          ) : (
            chain.map((member, idx) => (
              <ReportingCard
                key={member.id}
                label={idx === 0 ? 'Reporting Manager' : roleLine(member)}
                name={member.name}
                subtitle={roleLine(member)}
                employeeId={member.employeeId}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
