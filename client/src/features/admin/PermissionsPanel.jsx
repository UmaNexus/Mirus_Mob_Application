import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Check } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { getPermissionsCatalog } from '../../api/admin.js';
import { notifyError } from '../ui/toastSlice.js';

const ROLE_ORDER = ['superadmin', 'admin', 'hr', 'employee'];

/**
 * Read-only view of the existing role → permission mapping
 * (server/config/permissions.js) — no per-user override mechanism is
 * introduced; a user's permissions are exactly their role's permissions,
 * shown here so an admin can see what assigning a given role actually
 * grants before doing it.
 */
export default function PermissionsPanel() {
  const dispatch = useDispatch();
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setCatalog(await getPermissionsCatalog());
      } catch (err) {
        dispatch(notifyError(err.uiMessage));
      } finally {
        setLoading(false);
      }
    })();
  }, [dispatch]);

  if (loading) return <Card className="flex items-center justify-center p-16"><Spinner size={28} /></Card>;
  if (!catalog) return null;

  const permissionKeys = Object.values(catalog.permissions).sort();
  const roleGrants = (role) => new Set(catalog.rolePermissions[role] || []);
  const hasGrant = (role, perm) => {
    const grants = roleGrants(role);
    return grants.has('*') || grants.has(perm);
  };

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-slate-50 text-left">
            <th className="px-4 py-3 font-semibold text-ink">Permission</th>
            {ROLE_ORDER.map((role) => (
              <th key={role} className="px-4 py-3 text-center font-semibold capitalize text-ink">{role}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {permissionKeys.map((perm) => (
            <tr key={perm} className="border-b border-line last:border-b-0 hover:bg-slate-50">
              <td className="px-4 py-2 font-mono text-xs text-ink">{perm}</td>
              {ROLE_ORDER.map((role) => (
                <td key={role} className="px-4 py-2 text-center">
                  {hasGrant(role, perm) && <Check size={16} className="mx-auto text-success" />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
