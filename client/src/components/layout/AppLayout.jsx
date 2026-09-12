import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Drawer from '@mui/material/Drawer';
import SidebarNav from './SidebarNav.jsx';
import Topbar from './Topbar.jsx';
import { logout, selectUser } from '../../features/auth/authSlice.js';
import { notifySuccess } from '../../features/ui/toastSlice.js';

const SIDEBAR_W = 256;

export default function AppLayout() {
  const user = useSelector(selectUser);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await dispatch(logout());
    dispatch(notifySuccess('You have been logged out.'));
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* Permanent desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <SidebarNav role={user?.role} onLogout={handleLogout} />
      </aside>

      {/* Mobile drawer (MUI) */}
      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { lg: 'none' }, '& .MuiDrawer-paper': { width: SIDEBAR_W, border: 0 } }}
      >
        <SidebarNav role={user?.role} onNavigate={() => setMobileOpen(false)} onLogout={handleLogout} />
      </Drawer>

      {/* Content column */}
      <div className="lg:pl-64">
        <Topbar user={user} onMenuClick={() => setMobileOpen(true)} onLogout={handleLogout} />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
