import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import Tooltip from '@mui/material/Tooltip';
import { Search, FileText, Eye, Check, X, FileCheck2, Inbox } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardHeader, CardBody } from '../../components/ui/Card.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { listUsers } from '../../api/users.js';
import { listUserDocuments, verifyDocument, documentFileUrl } from '../../api/documents.js';
import { fullName, DOC_TYPE_LABEL } from '../../config/constants.js';
import { cn } from '../../lib/cn.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const fileIdOf = (doc) => doc.fileUrl?.split('/').pop()?.replace('.pdf', '');
const pendingCount = (u) => (u.uploadedDocuments || []).filter((d) => d.verificationStatus === 'Pending').length;

export default function VerificationsPage() {
  const dispatch = useDispatch();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selected, setSelected] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setLoadingUsers(true);
    listUsers({ search, limit: 15, employeesOnly: true })
      .then((r) => setUsers(r.data))
      .catch((err) => dispatch(notifyError(err.uiMessage || 'Could not load employees.')))
      .finally(() => setLoadingUsers(false));
  }, [search, dispatch]);

  const selectUser = async (user) => {
    setSelected(user);
    setLoadingDocs(true);
    try {
      setDocs(await listUserDocuments(user._id));
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Could not load documents.'));
    } finally {
      setLoadingDocs(false);
    }
  };

  const setStatus = async (doc, status) => {
    const fileId = fileIdOf(doc);
    if (!fileId) {
      dispatch(notifyError('Could not update document: invalid document id.'));
      return;
    }
    setBusyId(fileId);
    try {
      const updated = await verifyDocument(fileId, status);
      setDocs((prev) => prev.map((d) => (fileIdOf(d) === fileId ? updated : d)));
      // Reflect the change in the picker's pending badge.
      setUsers((prev) => prev.map((u) => (u._id === selected._id
        ? { ...u, uploadedDocuments: (u.uploadedDocuments || []).map((d) => (fileIdOf(d) === fileId ? { ...d, verificationStatus: status } : d)) }
        : u)));
      dispatch(notifySuccess(`Document marked ${status}.`));
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Could not update document status.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader title="Document Verifications" subtitle="Review and approve employee-submitted documents" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* User picker */}
        <Card className="lg:col-span-1">
          <CardBody className="p-3">
            <div className="relative mb-2">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-10" placeholder="Search employees…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            </div>
            <div className="max-h-[520px] space-y-1 overflow-y-auto">
              {loadingUsers ? (
                <div className="flex justify-center py-10"><Spinner className="text-primary-600" /></div>
              ) : users.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">No employees found.</p>
              ) : users.map((u) => {
                const pend = pendingCount(u);
                return (
                  <button
                    key={u._id}
                    onClick={() => selectUser(u)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition',
                      selected?._id === u._id ? 'bg-primary-50 ring-1 ring-primary-200' : 'hover:bg-slate-50'
                    )}
                  >
                    <Avatar src={u.personalDetails?.profilePictureUrl} name={fullName(u)} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{fullName(u)}</p>
                      <p className="truncate text-xs text-muted">{u.employeeDetails?.department || u.email}</p>
                    </div>
                    {pend > 0 && <span className="badge-warning">{pend}</span>}
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>

        {/* Document panel */}
        <Card className="lg:col-span-2">
          {!selected ? (
            <EmptyState icon={FileCheck2} title="Select an employee" message="Pick an employee from the list to review their submitted documents." />
          ) : (
            <>
              <CardHeader title={fullName(selected)} subtitle={`${docs.length} document(s) in vault`} />
              <CardBody className="p-0">
                {loadingDocs ? (
                  <div className="flex justify-center py-12"><Spinner size={28} className="text-primary-600" /></div>
                ) : docs.length === 0 ? (
                  <EmptyState icon={Inbox} title="No documents uploaded" message="This employee hasn't uploaded any documents yet." />
                ) : (
                  <ul className="divide-y divide-line">
                    {docs.map((d) => {
                      const fid = fileIdOf(d);
                      return (
                        <li key={fid} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600"><FileText size={18} /></span>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-ink">{d.documentName || DOC_TYPE_LABEL[d.documentType] || d.documentType}</p>
                            <p className="text-xs text-muted">{DOC_TYPE_LABEL[d.documentType] || d.documentType} · Ref: {d.documentNumber} · {new Date(d.uploadedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p>
                          </div>
                          <StatusBadge status={d.verificationStatus?.toLowerCase()} />
                          <div className="flex items-center gap-1.5">
                            <Tooltip title="View PDF"><a className="btn-ghost p-2 text-primary-600" href={documentFileUrl(fid)} target="_blank" rel="noreferrer"><Eye size={16} /></a></Tooltip>
                            {d.verificationStatus !== 'Verified' && (
                              <Button size="sm" loading={busyId === fid} onClick={() => setStatus(d, 'Verified')}><Check size={14} /> Verify</Button>
                            )}
                            {d.verificationStatus !== 'Rejected' && (
                              <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft" disabled={busyId === fid} onClick={() => setStatus(d, 'Rejected')}><X size={14} /> Reject</Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardBody>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
