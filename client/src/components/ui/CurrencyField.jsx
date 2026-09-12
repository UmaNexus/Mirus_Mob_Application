import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import { rupeesToWords } from '../../lib/numberToWords.js';

/**
 * Rupee amount input. Displays the value with Indian comma grouping
 * (e.g. 21,00,000) and shows the amount in words beneath the field.
 *
 * @param {number|''} value  numeric rupee value held by the parent
 * @param {(n:number|'')=>void} onChange
 */
export default function CurrencyField({ value, onChange, label = 'Annual CTC', required, fullWidth = true, helperText }) {
  const display = value === '' || value == null ? '' : Number(value).toLocaleString('en-IN');
  const words = value ? `${rupeesToWords(value)} Rupees` : helperText;

  const handle = (e) => {
    const digits = e.target.value.replace(/[^0-9]/g, '');
    onChange(digits === '' ? '' : Number(digits));
  };

  return (
    <TextField
      label={label}
      value={display}
      onChange={handle}
      required={required}
      fullWidth={fullWidth}
      inputMode="numeric"
      slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }}
      helperText={words}
      FormHelperTextProps={{ sx: { textTransform: 'capitalize', fontWeight: 500, color: 'text.secondary' } }}
    />
  );
}
