import { useState } from 'react';
import { ChevronDown, ChevronRight, CornerDownRight, Pencil, Repeat, TriangleAlert, UserPlus } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { roleLabelOf } from '../../config/roleLabel.js';
import { fullName } from '../../config/constants.js';
import AssignRoleDialog from './AssignRoleDialog.jsx';
import ReplaceManagerDialog from './ReplaceManagerDialog.jsx';

const initials = (u) => {
  const n = fullName(u);
  if (n === '—') return (u.email || '?')[0].toUpperCase();
  return n.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
};

const roleLabel = (u) => {
  return roleLabelOf(u) || 'No role';
};

function TreeNode({ node, isRoot, collapsed, onToggle, onAssign, onReplace }) {
  const hasChildren = node.children?.length > 0;
  const isCollapsed = collapsed.has(String(node._id));
  const isAdminNode = node.role === 'admin' || node.role === 'superadmin';
  const directReportCount = node.children?.length || 0;
  // A manager is whoever actually has direct reports (reportingManagerId is the only hierarchy).
  const isManagerTier = !isAdminNode && directReportCount > 0;

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
            <span className="text-xs text-muted">{`(${node.employeeDetails?.workLocation || 'No Work Location'})`}</span>
            <StatusBadge status={node.isActive ? 'active' : 'inactive'} />
          </div>
          <p className="text-xs text-muted">
            {node.employeeDetails?.employeeId || 'No Employee ID'}
            {` · ${directReportCount} direct report${directReportCount === 1 ? '' : 's'}`}
          </p>
          {node.hierarchyIssue && (
            <p className="text-xs font-medium text-warning">
              Invalid reporting line: {node.hierarchyIssue.level} reports to {node.hierarchyIssue.managerLevel} — expected {node.hierarchyIssue.expected}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!isAdminNode && (
            <button type="button" className="btn-ghost flex items-center gap-1 px-2 py-1.5 text-xs font-medium" title="Change this person's role or reporting manager" onClick={() => onAssign(node)}>
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

  // Reporting manager shown from reportingManagerId alone (independent of the user's role).
  const nodesById = new Map();
  const index = (node) => { nodesById.set(String(node._id), node); (node.children || []).forEach(index); };
  roots.forEach(index);
  const managerLabel = (u) => {
    const id = u.employeeDetails?.reportingManagerId;
    if (!id) return 'Unassigned';
    const m = nodesById.get(String(id));
    return m ? fullName(m) : 'Assigned';
  };

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
            Newly onboarded employees — HRMS onboarding created these users, but no Admin has assigned a role or reporting manager yet.
          </p>
          {unassigned.map((u) => (
            <div key={u._id} className="flex items-center justify-between border-t border-line py-2 first:border-t-0">
              <div>
                <span className="font-medium text-ink">{fullName(u)}</span>
                <p className="text-xs text-muted">
                  {u.employeeDetails?.employeeId || 'No Employee ID'} · {u.employeeDetails?.department || 'No department'} · {u.employeeDetails?.designation || 'No designation'} · {u.employeeDetails?.workLocation || 'No Work Location'}
                </p>
                {/* Role and reporting manager are independent: each is shown from its own source (JobRole / reportingManagerId). */}
                <p className="text-xs text-muted">
                  Role: <span className="font-medium">{roleLabelOf(u) || 'Unassigned'}</span> · Reporting manager: <span className="font-medium">{managerLabel(u)}</span>
                </p>
              </div>
              <button type="button" className="btn-ghost flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-primary-600" title="Assign role & reporting manager" onClick={() => setAssignTarget(u)}>
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
            These users carry a role but their reporting chain doesn&apos;t resolve up to an Admin — assign a valid manager to place them in the hierarchy.
          </p>
          {unattached.map((u) => (
            <div key={u._id} className="flex items-center justify-between border-t border-line py-2 first:border-t-0">
              <div>
                <span className="font-medium text-ink">{fullName(u)}</span>{' '}
                <span className="badge-neutral">{roleLabel(u)}</span>
                <p className="text-xs text-muted">{u.employeeDetails?.employeeId || 'No Employee ID'} · {u.email} · {u.employeeDetails?.workLocation || 'No Work Location'} · Reporting manager: {managerLabel(u)}</p>
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
