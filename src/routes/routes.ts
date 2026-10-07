import { lazy, type ComponentType } from 'react';
import { CalendarDays, Database, Droplets, LayoutDashboard, Users, Wallet, type LucideIcon } from 'lucide-react';

// Each screen is its own chunk (Polish PL1): it is downloaded the first time its route opens, so
// the first load carries only the shell (layout, navigation, guards, login, 404). App.tsx wraps
// every page in one Suspense fallback; a failed download is caught by the top-level ErrorBoundary.
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const FarmersPage = lazy(() => import('@/pages/farmers/FarmersPage').then((m) => ({ default: m.FarmersPage })));
const FarmerProfilePage = lazy(() => import('@/pages/farmers/FarmerProfilePage').then((m) => ({ default: m.FarmerProfilePage })));
const MonthsPage = lazy(() => import('@/pages/months/MonthsPage').then((m) => ({ default: m.MonthsPage })));
const BackupPage = lazy(() => import('@/pages/backup/BackupPage').then((m) => ({ default: m.BackupPage })));
const UsagePage = lazy(() => import('@/pages/usage/UsagePage').then((m) => ({ default: m.UsagePage })));
const PaymentsPage = lazy(() => import('@/pages/payments/PaymentsPage').then((m) => ({ default: m.PaymentsPage })));

export interface FeatureRoute {
  path: string;
  /** Hinglish screen title. */
  title: string;
  /** Rebuild phase that builds this screen (shown on the temporary placeholder). */
  phase: number;
  /** The built screen; routes without one render the shared placeholder. */
  page?: ComponentType;
}

export interface NavTab {
  to: string;
  label: string;
  icon: LucideIcon;
}

// Feature routes. Each renders the shared placeholder until its phase gives it a `page`.
export const FEATURE_ROUTES: FeatureRoute[] = [
  { path: '/', title: 'Dashboard', phase: 7, page: DashboardPage },
  { path: '/farmers', title: 'Kisan', phase: 4, page: FarmersPage },
  { path: '/farmers/:id', title: 'Kisan ka Hisaab', phase: 6, page: FarmerProfilePage },
  { path: '/usage', title: 'Pani Entry', phase: 4, page: UsagePage },
  { path: '/payments', title: 'Paisa', phase: 5, page: PaymentsPage },
  { path: '/months', title: 'Mahine', phase: 7, page: MonthsPage },
  { path: '/backup', title: 'Backup', phase: 8, page: BackupPage },
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
