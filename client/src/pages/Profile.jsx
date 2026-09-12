import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import TextField from '@mui/material/TextField';
import { Upload, Trash2, Save, LogOut, KeyRound } from 'lucide-react';
import api from '../lib/axios.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Card, CardHeader, CardBody } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import { selectUser, setUser, patchUser, logout } from '../features/auth/authSlice.js';
import { notifySuccess, notifyError } from '../features/ui/toastSlice.js';

export default function Profile() {
  const user = useSelector(selectUser);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [details, setDetails] = useState({ firstName: '', lastName: '', workEmail: '', phone: '' });
  const [savingDetails, setSavingDetails] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);

  // Hydrate the form from the cached user.
  useEffect(() => {
    if (!user) return;
    setDetails({
      firstName: user.personalDetails?.firstName || '',
      lastName: user.personalDetails?.lastName || '',
      workEmail: user.email || '',
      phone: user.contactInfo?.personalMobile || ''
    });
  }, [user]);

  const name = `${details.firstName} ${details.lastName}`.trim() || 'Me';
  const avatarUrl = user?.personalDetails?.profilePictureUrl || null;

  const saveDetails = async (e) => {
    e.preventDefault();
    setSavingDetails(true);
    try {
      const { data } = await api.put('/profile', details);
      dispatch(setUser(data.user));
      dispatch(notifySuccess('Profile updated successfully.'));
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setSavingDetails(false);
    }
  };

  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) return dispatch(notifyError('Avatar must be JPEG or PNG.'));
    if (file.size > 2 * 1024 * 1024) return dispatch(notifyError('Avatar must be 2MB or smaller.'));

    const fd = new FormData();
    fd.append('avatar', file);
    setUploading(true);
    try {
      const { data } = await api.post('/profile/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      dispatch(patchUser({ personalDetails: { ...user.personalDetails, profilePictureUrl: data.profilePictureUrl } }));
      dispatch(notifySuccess('Avatar updated.'));
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setUploading(false);
    }
  };

  const deleteAvatar = async () => {
    if (!avatarUrl) return;
    setUploading(true);
    try {
      await api.delete('/profile/avatar');
      dispatch(patchUser({ personalDetails: { ...user.personalDetails, profilePictureUrl: null } }));
      dispatch(notifySuccess('Avatar removed.'));
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setUploading(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return dispatch(notifyError('New passwords do not match.'));
    setSavingPw(true);
    try {
      await api.patch('/profile/password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      dispatch(notifySuccess('Password changed successfully.'));
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setSavingPw(false);
    }
  };

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login', { replace: true });
  };

  return (
    <div>
      <PageHeader title="Profile Settings" subtitle="Manage your personal details and security." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Avatar card */}
        <Card className="lg:col-span-1">
          <CardBody className="flex flex-col items-center text-center">
            <Avatar src={avatarUrl} name={name} size={120} className="ring-4" />
            <h3 className="mt-4 text-lg font-semibold text-ink">{name}</h3>
            <p className="text-sm capitalize text-muted">{user?.role}</p>

            <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={onPickAvatar} />
            <div className="mt-5 flex w-full flex-col gap-2">
              <Button variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}>
                <Upload size={16} /> Upload New
              </Button>
              <Button variant="ghost" className="text-danger hover:bg-danger-soft" disabled={!avatarUrl || uploading} onClick={deleteAvatar}>
                <Trash2 size={16} /> Delete Avatar
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted">JPEG or PNG, up to 2MB.</p>
          </CardBody>
        </Card>

        {/* Details + security */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Personal Details" />
            <CardBody>
              <form onSubmit={saveDetails} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField label="First Name" value={details.firstName} onChange={(e) => setDetails({ ...details, firstName: e.target.value })} fullWidth required />
                  <TextField label="Last Name" value={details.lastName} onChange={(e) => setDetails({ ...details, lastName: e.target.value })} fullWidth required />
                  <TextField label="Work Email" type="email" value={details.workEmail} onChange={(e) => setDetails({ ...details, workEmail: e.target.value })} fullWidth />
                  <TextField label="Phone" value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} fullWidth />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" loading={savingDetails}><Save size={16} /> Save Changes</Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Security" subtitle="Update your account password." />
            <CardBody>
              <form onSubmit={changePassword} className="space-y-4">
                <TextField label="Current Password" type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} fullWidth required autoComplete="current-password" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField label="New Password" type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} fullWidth required autoComplete="new-password" helperText="Min 8 chars, with a letter and a number" />
                  <TextField label="Confirm New Password" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} fullWidth required autoComplete="new-password" />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" variant="secondary" loading={savingPw}><KeyRound size={16} /> Update Password</Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <div className="flex justify-end">
            <Button variant="ghost" className="text-danger hover:bg-danger-soft" onClick={handleLogout}>
              <LogOut size={16} /> Logout
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
