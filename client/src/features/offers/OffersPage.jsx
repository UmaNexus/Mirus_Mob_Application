import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import { Search, Plus, FileSpreadsheet, Eye, Send, CheckCircle2, RefreshCw, Trash2, FileCheck } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import DataGrid from '../../components/ui/DataGrid.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import TablePager from '../../components/ui/TablePager.jsx';
import CreateOfferDialog from './CreateOfferDialog.jsx';
import BulkUploadDialog from './BulkUploadDialog.jsx';
import {
  listOffers, updateOfferStatus, approveOffer, generateAppointmentLetter, resendOffer,
  regenerateOffer, deleteOffer, offerPdfUrl
} from '../../api/offers.js';
import { OFFER_STATUSES } from '../../config/constants.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function OffersPage() {
  const dispatch = useDispatch();
  const [filters, setFilters] = useState({ search: '', status: '' });
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [resp, setResp] = useState({ data: [], pagination: { total: 0, pages: 1 } });
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [confirm, setConfirm] = useState(null); // { type: 'delete'|'regenerate'|'appointment', offer }

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setFilters((f) => ({ ...f, search: searchInput })); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchOffers = async () => {
    setLoading(true);
    try {
      setResp(await listOffers({ ...filters, page, limit }));
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchOffers(); }, [filters, page, limit]);

  const changeStatus = async (offer, status) => {
    try {
      await updateOfferStatus(offer._id, status);
      dispatch(notifySuccess(`Offer marked ${status}.`));
      fetchOffers();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    }
  };

  const resend = async (offer) => {
    setBusyId(offer._id);
    try {
      await resendOffer(offer._id);
      dispatch(notifySuccess('Offer reminder re-sent with PDF attached.'));
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (offer) => {
    setBusyId(offer._id);
    try {
      const res = await approveOffer(offer._id);
      dispatch(notifySuccess(res.message || 'Offer approved — credentials emailed.'));
      fetchOffers();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setBusyId(null);
    }
  };

  const runConfirm = async () => {
    if (!confirm?.offer) return;
    const { type, offer } = confirm;
    setBusyId(offer._id);
    try {
      if (type === 'delete') {
        await deleteOffer(offer._id);
        dispatch(notifySuccess('Offer deleted.'));
      } else if (type === 'regenerate') {
        await regenerateOffer(offer._id);
        dispatch(notifySuccess('Offer PDF regenerated. You can resend when ready.'));
      } else if (type === 'appointment') {
        const location = String(offer.location || '').trim();
        const res = await generateAppointmentLetter(offer._id, location ? { location } : {});
        dispatch(notifySuccess(res.message || 'Appointment letter generated and emailed.'));
      }
      setConfirm(null);
      fetchOffers();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setBusyId(null);
    }
  };

  const STATUS_COLOR = { sent: '#D97706', pending: '#0EA5E9', signed: '#7C3AED', accepted: '#16A34A', declined: '#DC2626' };

  const columnDefs = useMemo(() => [
    { headerName: 'Candidate', field: 'fullName', minWidth: 170, flex: 1.5 },
    { headerName: 'Email', field: 'candidateEmail', minWidth: 200, flex: 1.5 },
    { headerName: 'Position', field: 'position', minWidth: 150 },
    { headerName: 'Offer Date', field: 'offerDate', valueFormatter: (p) => fmtDate(p.value), maxWidth: 140 },
    {
      headerName: 'Status', field: 'status', filter: false, sortable: false, minWidth: 150,
      cellRenderer: (p) => (
        <Select
          value={p.data.status} size="small" variant="standard" disableUnderline
          onChange={(e) => changeStatus(p.data, e.target.value)}
          sx={{ fontSize: 13, fontWeight: 600, color: STATUS_COLOR[p.data.status], textTransform: 'capitalize' }}
        >
          {OFFER_STATUSES.map((s) => <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s}</MenuItem>)}
        </Select>
      )
    },
    {
      headerName: 'Actions', filter: false, sortable: false, minWidth: 220, maxWidth: 260,
      cellRenderer: (p) => {
        const o = p.data;
        const busy = busyId === o._id;
        const canMutate = o.status !== 'accepted';
        return (
          <div className="flex h-full items-center gap-0.5">
            <Tooltip title="View PDF">
              <a className="btn-ghost p-2 text-primary-600" href={offerPdfUrl(o._id)} target="_blank" rel="noreferrer">
                <Eye size={16} />
              </a>
            </Tooltip>
            {o.status === 'accepted' && (
              <Tooltip title="Generate Appointment Letter">
                <button
                  type="button"
                  className="btn-ghost p-2 text-primary-700 disabled:opacity-40"
                  disabled={busy}
                  onClick={() => setConfirm({ type: 'appointment', offer: o })}
                >
                  <FileCheck size={16} />
                </button>
              </Tooltip>
            )}
            {o.status === 'signed' && (
              <Tooltip title="Approve & issue credentials">
                <button type="button" className="btn-ghost p-2 text-success disabled:opacity-40" disabled={busy} onClick={() => approve(o)}>
                  <CheckCircle2 size={16} />
                </button>
              </Tooltip>
            )}
            {canMutate && o.status !== 'signed' && (
              <Tooltip title="Resend email">
                <button type="button" className="btn-ghost p-2 disabled:opacity-40" disabled={busy} onClick={() => resend(o)}>
                  <Send size={16} />
                </button>
              </Tooltip>
            )}
            {canMutate && (
              <Tooltip title="Regenerate PDF">
                <button type="button" className="btn-ghost p-2 disabled:opacity-40" disabled={busy} onClick={() => setConfirm({ type: 'regenerate', offer: o })}>
                  <RefreshCw size={16} />
                </button>
              </Tooltip>
            )}
            {canMutate && (
              <Tooltip title="Delete">
                <button type="button" className="btn-ghost p-2 text-danger disabled:opacity-40" disabled={busy} onClick={() => setConfirm({ type: 'delete', offer: o })}>
                  <Trash2 size={16} />
                </button>
              </Tooltip>
            )}
          </div>
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [busyId]);

  return (
    <div>
      <PageHeader
        title="Offer Letters" subtitle={`${resp.pagination.total} offers`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setBulkOpen(true)}><FileSpreadsheet size={16} /> Bulk XLSX</Button>
            <Button onClick={() => setCreateOpen(true)}><Plus size={16} /> Create Offer</Button>
          </>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative sm:col-span-2">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-10" placeholder="Search candidate, email, position…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <TextField select size="small" label="Status" value={filters.status} onChange={(e) => { setPage(1); setFilters({ ...filters, status: e.target.value }); }}>
            <MenuItem value="">All statuses</MenuItem>
            {OFFER_STATUSES.map((s) => <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s}</MenuItem>)}
          </TextField>
        </div>
      </Card>

      <DataGrid rowData={resp.data} columnDefs={columnDefs} loading={loading} pagination={false} height={560} />

      <TablePager
        page={page}
        pages={resp.pagination.pages || 1}
        total={resp.pagination.total || 0}
        limit={limit}
        showingCount={resp.data.length}
        onPageChange={setPage}
        onLimitChange={(n) => { setLimit(n); setPage(1); }}
      />

      <CreateOfferDialog open={createOpen} onClose={() => setCreateOpen(false)} onSaved={fetchOffers} />
      <BulkUploadDialog open={bulkOpen} onClose={() => setBulkOpen(false)} onDone={fetchOffers} />

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        loading={Boolean(busyId)}
        danger={confirm?.type === 'delete'}
        title={
          confirm?.type === 'delete'
            ? 'Delete offer?'
            : confirm?.type === 'appointment'
              ? 'Generate appointment letter?'
              : 'Regenerate offer PDF?'
        }
        confirmLabel={
          confirm?.type === 'delete'
            ? 'Delete'
            : confirm?.type === 'appointment'
              ? 'Generate & email'
              : 'Regenerate'
        }
        message={
          confirm?.type === 'delete'
            ? `"${confirm.offer.fullName}" — the offer and its PDF will be permanently removed.`
            : confirm?.type === 'appointment'
              ? `"${confirm?.offer?.fullName}" — generate the Appointment Letter from Template Setup and email the PDF to ${confirm?.offer?.candidateEmail}.`
              : `"${confirm?.offer?.fullName}" — rebuild the PDF from the salary freeze and letter template. Any e-signature will be cleared; resend afterward if needed.`
        }
      />
    </div>
  );
}
