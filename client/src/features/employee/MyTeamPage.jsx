import { Users2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import useAsync from '../../hooks/useAsync.js';
import { getHubOverview } from '../../api/selfService.js';

export default function MyTeamPage() {
  const { data, loading } = useAsync(() => getHubOverview(), []);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} className="text-primary-600" /></div>;
  const manager = data?.profile?.reportingManager;

  return (
    <div>
      <PageHeader title="My Team & Reporting" subtitle="Your reporting line" />
      {manager ? (
        <Card>
          <CardBody>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Reporting Manager</p>
            <div className="flex items-center gap-3">
              <Avatar name={manager} size={48} />
              <div>
                <p className="font-semibold text-ink">{manager}</p>
                <p className="text-sm text-muted">Manager</p>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card><EmptyState icon={Users2} title="No reporting manager assigned" message="Your reporting line will appear here once HR assigns a manager." /></Card>
      )}
    </div>
  );
}
