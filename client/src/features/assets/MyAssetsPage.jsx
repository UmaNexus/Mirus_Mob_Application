import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import useAsync from '../../hooks/useAsync.js';
import { Laptop } from 'lucide-react';
import { myAssets } from '../../api/assets.js';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function MyAssetsPage() {
  const { data } = useAsync(myAssets, []);
  return (
    <div>
      <PageHeader title="My Assets" subtitle="Company assets issued to you" />
      {!data?.length
        ? <Card><EmptyState icon={Laptop} title="No assets assigned" message="Assets issued to you will appear here." /></Card>
        : (
          <Card><CardBody>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted"><th className="pb-2">Tag</th><th className="pb-2">Type</th><th className="pb-2">Description</th><th className="pb-2">Issued</th></tr></thead>
              <tbody>
                {data.map((a) => (
                  <tr key={a._id} className="border-t border-line"><td className="py-2 font-medium text-ink">{a.tag}</td><td className="py-2">{a.type}</td><td className="py-2 text-muted">{a.description || '—'}</td><td className="py-2">{fmt(a.issuedAt)}</td></tr>
                ))}
              </tbody>
            </table>
          </CardBody></Card>
        )}
    </div>
  );
}
