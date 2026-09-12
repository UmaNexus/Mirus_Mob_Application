import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu as MenuIcon, Search, ChevronDown } from 'lucide-react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import Divider from '@mui/material/Divider';
import { UserCircle2, LogOut } from 'lucide-react';
import Avatar from '../ui/Avatar.jsx';

const roleLabel = { admin: 'Admin', hr: 'HR', employee: 'Employee' };

export default function Topbar({ user, onMenuClick, onLogout }) {
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(null);
  const name = `${user?.personalDetails?.firstName || ''} ${user?.personalDetails?.lastName || ''}`.trim() || 'Me';
  const avatarUrl = user?.personalDetails?.profilePictureUrl || null;
  const profilePath = user?.role === 'employee' ? '/me' : '/profile';

  const go = (path) => { setAnchor(null); navigate(path); };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur lg:px-6">
      {/* Mobile menu */}
      <button onClick={onMenuClick} className="btn-ghost -ml-2 p-2 lg:hidden" aria-label="Open menu">
        <MenuIcon size={22} />
      </button>

      {/* Global search */}
      <div className="relative hidden w-full max-w-md sm:block">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-10" placeholder="Search everything…" />
      </div>

      {/* Profile chip — pinned to the right edge */}
      <button
        onClick={(e) => setAnchor(e.currentTarget)}
        className="ml-auto flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 transition hover:bg-slate-100"
      >
        <Avatar src={avatarUrl} name={name} size={36} />
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-semibold leading-tight text-ink">{name}</span>
          <span className="block text-xs leading-tight text-muted">{roleLabel[user?.role] || 'Member'}</span>
        </span>
        <ChevronDown size={16} className="text-slate-400" />
      </button>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 1, minWidth: 200, borderRadius: 2 } } }}
      >
        <MenuItem onClick={() => go(profilePath)}>
          <ListItemIcon><UserCircle2 size={18} /></ListItemIcon>
          My Profile
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { setAnchor(null); onLogout(); }} sx={{ color: 'error.main' }}>
          <ListItemIcon><LogOut size={18} color="#DC2626" /></ListItemIcon>
          Logout
        </MenuItem>
      </Menu>
    </header>
  );
}
