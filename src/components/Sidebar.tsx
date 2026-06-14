import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FlaskConical, PlusCircle, Users,
  LogOut, Sun, Moon, Menu, X, Activity, BarChart3,
  Shield, ChevronRight, Pencil,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { clsx } from '../lib/utils';
import ProfileModal from './ProfileModal';

const navItems = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard',   roles: ['admin','manager','user'] },
  { to: '/data-entry',   icon: PlusCircle,      label: 'Data Entry',  roles: ['admin','manager','user'] },
  { to: '/records',      icon: BarChart3,        label: 'Records',     roles: ['admin','manager','user'] },
  { to: '/analytics',    icon: Activity,         label: 'Analytics',   roles: ['admin','manager','user'] },
  { to: '/users',        icon: Users,            label: 'User Mgmt',   roles: ['admin'] },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [collapsed, setCollapsed]     = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filtered = navItems.filter(n => user && n.roles.includes(user.role));

  return (
    <>
      <aside className={clsx(
        'flex flex-col h-full bg-white dark:bg-surface-900 border-r border-surface-100 dark:border-surface-800 transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-100 dark:border-surface-800">
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
                <FlaskConical size={16} className="text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-surface-900 dark:text-white leading-none">EHA</p>
                <p className="text-[10px] text-surface-500 dark:text-surface-400 leading-none mt-0.5">Hit Analytics</p>
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="btn-ghost p-1.5 rounded-lg"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRight size={16} /> : <Menu size={16} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-thin">
          {filtered.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to !== '/data-entry'}
              className={({ isActive }) => clsx(
                'sidebar-link',
                isActive && 'active',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={18} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-surface-100 dark:border-surface-800 space-y-1">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={clsx('sidebar-link w-full', collapsed && 'justify-center px-2')}
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {!collapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>

          {/* User card — clickable to open profile */}
          {user && (
            <button
              onClick={() => setShowProfile(true)}
              title="Edit your profile"
              className={clsx(
                'w-full text-left transition-all rounded-xl group',
                collapsed
                  ? 'flex items-center justify-center p-2 hover:bg-surface-100 dark:hover:bg-surface-800'
                  : 'flex items-center gap-2.5 px-3 py-2 hover:bg-surface-100 dark:hover:bg-surface-800 bg-surface-50 dark:bg-surface-800'
              )}
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">{user.name[0].toUpperCase()}</span>
                </div>
                {/* Edit pencil on hover */}
                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-brand-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Pencil size={8} className="text-white" />
                </div>
              </div>

              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-surface-800 dark:text-surface-200 truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {user.name}
                  </p>
                  <div className="flex items-center gap-1">
                    <Shield size={9} className="text-brand-500" />
                    <p className="text-[10px] text-surface-500 dark:text-surface-400 capitalize">{user.role}</p>
                  </div>
                </div>
              )}

              {!collapsed && (
                <Pencil size={12} className="text-surface-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              )}
            </button>
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            className={clsx('sidebar-link w-full text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20', collapsed && 'justify-center px-2')}
            title="Logout"
          >
            <LogOut size={18} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Profile Modal */}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </>
  );
}
