import Pagination from '@mui/material/Pagination';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';

const PAGE_SIZES = [5, 10, 20, 50];

/**
 * Footer controls for table pagination (server or client).
 * Props: page (1-based), pages, total, limit, onPageChange, onLimitChange?
 */
export default function TablePager({
  page = 1,
  pages = 1,
  total = 0,
  limit = 10,
  onPageChange,
  onLimitChange,
  showingCount
}) {
  const shown = showingCount != null ? showingCount : Math.min(limit, Math.max(total - (page - 1) * limit, 0));
  return (
    <div className="mt-3 flex flex-col items-center justify-between gap-3 sm:flex-row">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <span>Showing {shown} of {total}</span>
        {onLimitChange && (
          <TextField
            select size="small" label="Per page" value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            sx={{ minWidth: 100 }}
          >
            {PAGE_SIZES.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </TextField>
        )}
      </div>
      <Pagination
        count={Math.max(pages || 1, 1)}
        page={page}
        onChange={(_, p) => onPageChange?.(p)}
        color="primary"
        shape="rounded"
        size="small"
      />
    </div>
  );
}
