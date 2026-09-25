import { useState } from 'react';
import { ChevronDown, ChevronRight, CornerDownRight, Pencil, Repeat, TriangleAlert, UserPlus } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { MANAGER_TIERS } from '../../config/fieldForce.js';
import { fullName } from '../../config/constants.js';
import AssignRoleDialog from './AssignRoleDialog.jsx';
import ReplaceManagerDialog from './ReplaceManagerDialog.jsx';

const initials = (u) => {
  const n = fullName(u);
  if (n === '—') return (u.email || '?')[0].toUpperCase();
  return n.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
};

const roleLabel = (u) => {
  if (u.role === 'admin' || u.role === 'superadmin') return 'Admin';
  return u.employeeDetails?.fieldForce?.tier || 'No tier';
};

function TreeNode({ node, isRoot, collapsed, onToggle, onAssign, onReplace }) {
  const hasChildren = node.children?.length > 0;
  const isCollapsed = collapsed.has(String(node._id));
  const tier = node.employeeDetails?.fieldForce?.tier;
  const isManagerTier = MANAGER_TIERS.includes(tier);
  const isAdminNode = node.role === 'admin' || node.role === 'superadmin';
  const directReportCount = node.children?.length || 0;

  return (
    <div>
      <div className="flex items-center gap-2 py-2">
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-slate-100 disabled:opacity-0"
          onClick={() => onToggle(node._id)}
          disabled={!hasChildren}
          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {hasChildren && (isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />)}
        </button>

        {/* Visual cue that this row reports to the row it's nested under — never shown for a root (Admin). */}
        {!isRoot && <CornerDownRight size={14} className="shrink-0 text-slate-300" />}

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
          {initials(node)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{fullName(node)}</span>
            <span className={`badge-neutral ${isAdminNode ? 'bg-primary-100 text-primary-700' : ''}`}>{roleLabel(node)}</span>
            <StatusBadge status={node.isActive ? 'active' : 'inactive'} />
          </div>
          <p className="text-xs text-muted">
            {node.employeeDetails?.employeeId || 'No Employee ID'}
            {node.employeeDetails?.fieldForce?.territory && ` · Territory: ${node.employeeDetails.fieldForce.territory}`}
            {` · ${directReportCount} direct report${directReportCount === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!isAdminNode && (
            <button type="button" className="btn-ghost flex items-center gap-1 px-2 py-1.5 text-xs font-medium" title="Change this person's field-force tier or reporting manager" onClick={() => onAssign(node)}>
              <Pencil size={14} /> Edit
            </button>
          )}
          {isManagerTier && (
            <button type="button" className="btn-ghost flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-primary-600" title="Replace this manager — their direct reports move to the replacement automatically" onClick={() => onReplace(node)}>
              <Repeat size={14} /> Replace
            </button>
          )}
        </div>
      </div>

      {/* Connecting line down to this node's own direct reports — indentation + line together make "reports to" unambiguous. */}
      {hasChildren && !isCollapsed && (
        <div className="ml-[11px] border-l-2 border-line pl-4">
          {node.children.map((child) => (
            <TreeNode key={child._id} node={child} isRoot={false} collapsed={collapsed} onToggle={onToggle} onAssign={onAssign} onReplace={onReplace} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgTree({ hierarchy, onChanged }) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [assignTarget, setAssignTarget] = useState(null);
  const [replaceTarget, setReplaceTarget] = useState(null);

  const onToggle = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const roots = hierarchy?.roots || [];
  const unassigned = hierarchy?.unassigned || [];
  const unattached = hierarchy?.unattached || [];

  return (
    <>
      <Card className="p-4">
        {roots.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No admin/field-force hierarchy found for this company yet.</p>
        ) : (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-muted">
            <CornerDownRight size={13} className="text-slate-300" /> Indentation and connecting lines show <span className="font-medium text-ink">reports to →</span>
          </p>
        )}
        {roots.map((root) => (
          <TreeNode key={root._id} node={root} isRoot collapsed={collapsed} onToggle={onToggle} onAssign={setAssignTarget} onReplace={setReplaceTarget} />
        ))}
      </Card>

      {unassigned.length > 0 && (
        <Card className="mt-4 p-4">
          <div className="mb-2 flex items-center gap-2 text-primary-700">
            <UserPlus size={16} />
            <span className="text-sm font-semibold">Unassigned / Pending Assignment ({unassigned.length})</span>
          </div>
          <p className="mb-3 text-xs text-muted">
            Newly onboarded employees — HRMS onboarding created these users, but no Admin has assigned a field-force tier or reporting manager yet.
          </p>
          {unassigned.map((u) => (
            <div key={u._id} className="flex items-center justify-between border-t border-line py-2 first:border-t-0">
              <div>
                <span className="font-medium text-ink">{fullName(u)}</span>
                <p className="text-xs text-muted">
                  {u.employeeDetails?.employeeId || 'No Employee ID'} · {u.employeeDetails?.department || 'No department'} · {u.employeeDetails?.designation || 'No designation'}
                </p>
                <p className="text-xs text-muted">Field-force tier: <span className="font-medium">Unassigned</span> · Reporting manager: <span className="font-medium">Unassigned</span></p>
              </div>
              <button type="button" className="btn-ghost flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-primary-600" title="Assign field-force tier & reporting manager" onClick={() => setAssignTarget(u)}>
                <Pencil size={14} /> Edit
              </button>
            </div>
          ))}
        </Card>
      )}

      {unattached.length > 0 && (
        <Card className="mt-4 border-warning/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-warning">
            <TriangleAlert size={16} />
            <span className="text-sm font-semibold">Needs a reporting manager ({unattached.length})</span>
          </div>
          <p className="mb-3 text-xs text-muted">
            These users carry a field-force tier but their reporting chain doesn&apos;t resolve up to an Admin — assign a valid manager to place them in the hierarchy.
          </p>
          {unattached.map((u) => (
            <div key={u._id} className="flex items-center justify-between border-t border-line py-2 first:border-t-0">
              <div>
                <span className="font-medium text-ink">{fullName(u)}</span>{' '}
                <span className="badge-neutral">{roleLabel(u)}</span>
                <p className="text-xs text-muted">{u.employeeDetails?.employeeId || 'No Employee ID'} · {u.email}</p>
              </div>
              <button type="button" className="btn-ghost flex items-center gap-1 px-2 py-1.5 text-xs font-medium" title="Change role / reporting manager" onClick={() => setAssignTarget(u)}>
                <Pencil size={14} /> Edit
              </button>
            </div>
          ))}
        </Card>
      )}

      <AssignRoleDialog
        open={Boolean(assignTarget)}
        user={assignTarget}
        hierarchy={hierarchy}
        onClose={() => setAssignTarget(null)}
        onSaved={() => { setAssignTarget(null); onChanged(); }}
      />
      <ReplaceManagerDialog
        open={Boolean(replaceTarget)}
        manager={replaceTarget}
        hierarchy={hierarchy}
        onClose={() => setReplaceTarget(null)}
        onSaved={() => { setReplaceTarget(null); onChanged(); }}
      />
    </>
  );
}
