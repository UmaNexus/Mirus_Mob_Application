import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormDialog from '../../components/ui/FormDialog.jsx';
import { replaceManager } from '../../api/admin.js';
import { fullName } from '../../config/constants.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';
import { roleLabelOf, roleKeyOf } from '../../config/roleLabel.js';

const flattenHierarchy = (hierarchy) => {
  if (!hierarchy) return [];
  const out = [];
  const walk = (node) => { out.push(node); (node.children || []).forEach(walk); };
  (hierarchy.roots || []).forEach(walk);
  (hierarchy.unattached || []).forEach((u) => out.push(u));
  return out;
};

/**
 * Replace a manager (ASM/RSM/ZSM/NSM) without destroying their subtree — the
 * replacement's own direct reports never change; only the manager being
 * replaced's DIRECT reports are re-parented to the replacement, atomically,
 * on the server (POST /api/admin/hierarchy/replace-manager).
 */
export default function ReplaceManagerDialog({ open, manager, hierarchy, onClose, onSaved }) {
  const dispatch = useDispatch();
  const [newManagerId, setNewManagerId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setNewManagerId(''); }, [manager]);

  const tier = roleLabelOf(manager);
  const roleKey = roleKeyOf(manager);
  const allUsers = useMemo(() => flattenHierarchy(hierarchy), [hierarchy]);
  const candidates = useMemo(
    () => allUsers.filter((u) => roleKey && roleKeyOf(u) === roleKey && String(u._id) !== String(manager?._id)),
    [allUsers, roleKey, manager]
  );

  const submit = async (e) => {
    e.preventDefault();
    if (!manager || !newManagerId) return;
    setSaving(true);
    try {
      const result = await replaceManager(manager._id, newManagerId);
      dispatch(notifySuccess(`${result.newManager.name} now manages ${result.reparentedCount} direct report(s) previously under ${result.oldManager.name}.`));
      onSaved?.();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open} onClose={onClose} onSubmit={submit} loading={saving}
      title="Replace Manager" subtitle={manager ? `${fullName(manager)} — ${tier}` : ''} formId="replace-manager-form"
      submitLabel="Replace"
    >
      <div className="grid grid-cols-1 gap-4 pt-1">
        <p className="text-sm text-muted">
          {manager?.children?.length
            ? `${manager.children.length} direct report${manager.children.length === 1 ? '' : 's'} will be re-parented to the replacement. Every deeper descendant stays exactly where they are.`
            : 'This manager currently has no direct reports.'}
        </p>
        <TextField
          select label={`Replacement (must hold the same role: ${tier})`} value={newManagerId} onChange={(e) => setNewManagerId(e.target.value)}
          fullWidth required
          helperText={candidates.length === 0 ? `No other ${tier} exists yet — assign that role to someone first.` : undefined}
        >
          {candidates.map((c) => <MenuItem key={c._id} value={c._id}>{fullName(c)} ({c.employeeDetails?.employeeId || c.email})</MenuItem>)}
        </TextField>
      </div>
    </FormDialog>
  );
}
