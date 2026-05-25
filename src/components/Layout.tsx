import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Farmer } from '@/types';
import {
  LayoutDashboard,
  Users,
  Droplets,
  Wallet,
  CalendarDays,
  Database,
  Settings,
  LogOut,
  Search,
  X,
  MessageCircle,
  ChevronRight,
} from 'lucide-react';
import { formatWhatsAppDisplay } from '@/lib/whatsapp';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/farmers', label: 'Kisan', icon: Users },
  { to: '/usage', label: 'Pani', icon: Droplets },
  { to: '/payments', label: 'Paisa', icon: Wallet },
  { to: '/months', label: 'Month', icon: CalendarDays },
  { to: '/backup', label: 'Backup', icon: Database },
  { to: '/settings', label: 'Setup', icon: Settings },
];

// Search index is loaded once on mount and re-loaded each time the search opens
// (to catch newly-added farmers). Cheap query: ~10 rows.
type SearchFarmer = Pick<Farmer, 'id' | 'name' | 'mobile' | 'whatsapp_number' | 'whatsapp_enabled'>;

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ── Global search state ────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFarmers, setSearchFarmers] = useState<SearchFarmer[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // ── Search helpers ─────────────────────────────────────────────────────────
  const loadSearchFarmers = useCallback(async () => {
    setSearchLoading(true);
    const { data } = await supabase
      .from('farmers')
      .select('id, name, mobile, whatsapp_number, whatsapp_enabled')
      .eq('is_deleted', false)
      .eq('is_disabled', false)
      .order('name');
    setSearchFarmers(data || []);
    setSearchLoading(false);
  }, []);

  const openSearch = () => {
    setSearchOpen(true);
    setSearchQuery('');
    loadSearchFarmers();
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
  };

  const handlePickFarmer = (id: string) => {
    closeSearch();
    navigate(`/farmers/${id}`);
  };

  // Auto-focus input when search opens
  useEffect(() => {
    if (searchOpen) {
      const id = window.setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
  }, [searchOpen]);

  // Close search on route change (e.g. when picking a farmer)
  useEffect(() => {
    setSearchOpen(false);
  }, [location.pathname]);

  // Esc closes overlay
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSearch();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  const q = searchQuery.trim().toLowerCase();
  const filteredFarmers = q
    ? searchFarmers.filter(f =>
        f.name.toLowerCase().includes(q) ||
        (f.mobile || '').toLowerCase().includes(q) ||
        (f.whatsapp_number || '').includes(q),
      )
    : searchFarmers; // show all when query empty (recently active list)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f7f5f2' }}>
      {/* Top Header */}
      <header className="bg-white border-b sticky top-0 z-40" style={{ borderColor: '#e5e2dc' }}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
              <Droplets size={16} color="white" />
            </div>
            <span className="font-bold text-gray-900 truncate">Tubewell Manager</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={openSearch}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              title="Kisan dhundo"
              aria-label="Search farmers"
            >
              <Search size={18} />
            </button>
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

      {/* Global Search Overlay */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-16"
          onClick={closeSearch}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-2 px-3 py-3 border-b" style={{ borderColor: '#e5e2dc' }}>
              <Search size={18} className="text-gray-400 shrink-0" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Kisan ka naam ya number..."
                className="flex-1 outline-none text-base placeholder:text-gray-400"
              />
              <button
                onClick={closeSearch}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                aria-label="Close search"
              >
                <X size={18} />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-y-auto">
              {searchLoading ? (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">Load ho raha hai...</div>
              ) : filteredFarmers.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">
                  {q ? `"${searchQuery}" ke liye koi kisan nahi mila` : 'Koi active kisan nahi hai'}
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: '#f5f5f4' }}>
                  {filteredFarmers.slice(0, 30).map(f => {
                    const waReady = f.whatsapp_enabled && !!f.whatsapp_number;
                    return (
                      <button
                        key={f.id}
                        onClick={() => handlePickFarmer(f.id)}
                        className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                          style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
                        >
                          {f.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-gray-900 truncate">{f.name}</span>
                            {waReady && (
                              <span
                                className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-100"
                                title={`WhatsApp: ${formatWhatsAppDisplay(f.whatsapp_number!)}`}
                              >
                                <MessageCircle size={9} className="text-green-600" />
                              </span>
                            )}
                          </div>
                          {f.mobile && (
                            <div className="text-xs text-gray-400 truncate">{f.mobile}</div>
                          )}
                        </div>
                        <ChevronRight size={16} className="text-gray-300 shrink-0" />
                      </button>
                    );
                  })}
                  {filteredFarmers.length > 30 && (
                    <div className="px-4 py-2 text-center text-[11px] text-gray-400">
                      Pehle 30 results dikhae — aur narrow karo
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
