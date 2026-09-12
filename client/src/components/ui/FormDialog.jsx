import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import { X } from 'lucide-react';
import Button from './Button.jsx';

/**
 * Generic modal form shell. Wrap the dialog body in a <form id={formId}> so the
 * footer submit button (form attribute) triggers it.
 */
export default function FormDialog({
  open, onClose, title, subtitle, children,
  onSubmit, submitLabel = 'Save', loading, maxWidth = 'sm', formId = 'dialog-form'
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth={maxWidth} fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogTitle sx={{ pr: 6, fontWeight: 700 }}>
        {title}
        {subtitle && <p className="mt-0.5 text-sm font-normal text-muted">{subtitle}</p>}
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }} size="small"><X size={18} /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <form id={formId} onSubmit={onSubmit}>{children}</form>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={formId} loading={loading}>{submitLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}
