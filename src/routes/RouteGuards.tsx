import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { FullScreenMessage } from '@/components/FullScreenMessage';

/** Renders children only for a signed-in user; otherwise redirects to /login. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <FullScreenMessage>Load ho raha hai...</FullScreenMessage>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** For the login page: a signed-in user is sent to the dashboard. */
export function PublicRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <FullScreenMessage>Load ho raha hai...</FullScreenMessage>;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}
