import { Construction } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Card } from '../components/ui/Card.jsx';

// Temporary stand-in for routes delivered in later epics.
export default function Placeholder({ title, epic }) {
  return (
    <div>
      <PageHeader title={title} />
      <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-600">
          <Construction size={26} />
        </div>
        <h3 className="text-lg font-semibold text-ink">Coming up next</h3>
        <p className="max-w-sm text-sm text-muted">
          The <span className="font-medium text-ink">{title}</span> module ships in {epic}. The backend APIs are already in place.
        </p>
      </Card>
    </div>
  );
}
