import { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import { Network, ShieldCheck } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { getHierarchy } from '../../api/admin.js';
import { notifyError } from '../ui/toastSlice.js';
import OrgTree from './OrgTree.jsx';
import PermissionsPanel from './PermissionsPanel.jsx';

/**
 * Org Hierarchy — the first admin-only feature area beyond Company
 * Settings. First version scope, per the org's explicit instruction:
 * User Role Assignment + Reporting Structure + Permissions only.
 */
export default function AdminDashboardPage() {
  const dispatch = useDispatch();
  const [tab, setTab] = useState(0);
  const [hierarchy, setHierarchy] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchHierarchy = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getHierarchy();
      setHierarchy(data);
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  useEffect(() => { fetchHierarchy(); }, [fetchHierarchy]);

  return (
    <div>
      <PageHeader
        title="Organization Hierarchy"
        subtitle="Organization hierarchy, role assignment, and permissions : who reports to whom, and each person's job role"
      />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab icon={<Network size={16} />} iconPosition="start" label="Reporting Structure" sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44 }} />
        <Tab icon={<ShieldCheck size={16} />} iconPosition="start" label="Permissions" sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44 }} />
      </Tabs>

      {tab === 0 && (
        loading ? (
          <Card className="flex items-center justify-center p-16"><Spinner size={28} /></Card>
        ) : (
          <OrgTree hierarchy={hierarchy} onChanged={fetchHierarchy} />
        )
      )}

      {tab === 1 && <PermissionsPanel />}
    </div>
  );
}
