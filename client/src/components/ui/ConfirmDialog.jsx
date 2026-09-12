import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { AlertTriangle } from 'lucide-react';
import Button from './Button.jsx';

export default function ConfirmDialog({
  open, onClose, onConfirm, loading,
  title = 'Are you sure?', message, confirmLabel = 'Confirm', danger = true
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700 }}>
        {danger && <span className="flex h-9 w-9 items-center justify-center rounded-full bg-danger-soft text-danger"><AlertTriangle size={18} /></span>}
        {title}
      </DialogTitle>
      <DialogContent><p className="text-sm text-muted">{message}</p></DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}
