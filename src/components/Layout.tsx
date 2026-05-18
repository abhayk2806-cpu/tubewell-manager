import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  Users,
  Droplets,
  Wallet,
  CalendarDays,
  Database,
  Settings,
  LogOut,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/farmers', label: 'Kisan', icon: Users },
  { to: '/usage', label: 'Pani', icon: Droplets },
  { to: '/payments', label: 'Paisa', icon: Wallet },
  { to: '/months', label: 'Month', icon: CalendarDays },
  { to: '/backup', label: 'Backup', icon: Database },
  { to: '/settings', label: 'Setup', icon: Settings },
];

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f7f5f2' }}>
      {/* Top Header */}
      <header className="bg-white border-b sticky top-0 z-40" style={{ borderColor: '#e5e2dc' }}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
              <Droplets size={16} color="white" />
            </div>
            <span className="font-bold text-gray-900">Tubewell Manager</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 hidden sm:block">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-20 overflow-auto">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t z-40" style={{ borderColor: '#e5e2dc' }}>
        <div className="flex items-center justify-around px-1 py-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-xl transition-all ${
                  isActive
                    ? 'text-blue-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`p-1 rounded-lg transition-all ${isActive ? 'bg-blue-50' : ''}`}>
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                  </div>
                  <span className="text-[10px] font-medium">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default Layout;
