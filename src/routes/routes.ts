import { CalendarDays, Database, Droplets, LayoutDashboard, Users, Wallet, type LucideIcon } from 'lucide-react';

export interface FeatureRoute {
  path: string;
  /** Hinglish screen title. */
  title: string;
  /** Rebuild phase that builds this screen (shown on the temporary placeholder). */
  phase: number;
}

export interface NavTab {
  to: string;
  label: string;
  icon: LucideIcon;
}

// Feature routes. Every one renders the shared placeholder until its phase is built.
export const FEATURE_ROUTES: FeatureRoute[] = [
  { path: '/', title: 'Dashboard', phase: 7 },
  { path: '/farmers', title: 'Kisan', phase: 4 },
  { path: '/farmers/:id', title: 'Kisan ka Hisaab', phase: 6 },
  { path: '/usage', title: 'Pani Entry', phase: 4 },
  { path: '/payments', title: 'Paisa', phase: 5 },
  { path: '/months', title: 'Mahine', phase: 7 },
  { path: '/backup', title: 'Backup', phase: 8 },
];

// Bottom navigation: the 6 top-level tabs (the farmer detail page is reached from the list).
export const NAV_TABS: NavTab[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/farmers', label: 'Kisan', icon: Users },
  { to: '/usage', label: 'Pani', icon: Droplets },
  { to: '/payments', label: 'Paisa', icon: Wallet },
  { to: '/months', label: 'Mahine', icon: CalendarDays },
  { to: '/backup', label: 'Backup', icon: Database },
];
