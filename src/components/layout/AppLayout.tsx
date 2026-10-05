import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Droplets, LogOut } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import { NAV_TABS } from '@/routes/routes';
import { cn } from '@/lib/utils';

export function AppLayout() {
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-card">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Droplets size={16} aria-hidden="true" />
            </span>
            <span className="truncate font-semibold">Tubewell Manager</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={signingOut}>
            <LogOut aria-hidden="true" />
            Logout
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-24 pt-4">
        <Outlet />
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card">
        <ul className="mx-auto flex max-w-2xl items-stretch justify-around px-1 py-1.5">
          {NAV_TABS.map(({ to, label, icon: Icon }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-xs font-medium transition-colors',
                    isActive ? 'bg-accent text-primary' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                <Icon size={20} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
