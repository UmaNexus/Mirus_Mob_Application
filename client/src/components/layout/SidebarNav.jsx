import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { navFor } from '../../config/nav.js';
import BrandLogo from '../ui/BrandLogo.jsx';

// Shared sidebar body — charcoal surface with orange active pill (Mirus brand).
export default function SidebarNav({ role, onNavigate, onLogout }) {
  const items = navFor(role);

  return (
    <div className="flex h-full flex-col bg-sidebar text-slate-200">
      <div className="px-5 py-5">
        <BrandLogo
          variant="mark"
          on="dark"
          markClassName="h-12 w-12 rounded-xl bg-white p-1.5"
          subtitle={`${role} Portal`}
        />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-sidebar-hover hover:text-white'
              )
            }
          >
            <Icon size={18} className="shrink-0" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-danger/90 hover:text-white"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </div>
  );
}
