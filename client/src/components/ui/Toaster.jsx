import { useDispatch, useSelector } from 'react-redux';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { selectToasts, dismissToast } from '../../features/ui/toastSlice.js';

// Renders the toast queue as stacked MUI Snackbars (bottom-right).
export default function Toaster() {
  const toasts = useSelector(selectToasts);
  const dispatch = useDispatch();

  return (
    <>
      {toasts.map((t, i) => (
        <Snackbar
          key={t.id}
          open
          autoHideDuration={4000}
          onClose={() => dispatch(dismissToast(t.id))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          sx={{ mb: `${i * 64}px` }}
        >
          <Alert
            severity={t.type === 'error' ? 'error' : t.type}
            variant="filled"
            onClose={() => dispatch(dismissToast(t.id))}
            sx={{ width: '100%', boxShadow: 3 }}
          >
            {t.title ? <strong>{t.title}: </strong> : null}{t.message}
          </Alert>
        </Snackbar>
      ))}
    </>
  );
}
