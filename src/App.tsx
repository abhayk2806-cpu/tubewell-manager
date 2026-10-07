import { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute, PublicRoute } from '@/routes/RouteGuards';
import { FEATURE_ROUTES } from '@/routes/routes';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageLoading } from '@/components/PageLoading';
import { LoginPage } from '@/pages/LoginPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        {FEATURE_ROUTES.map(({ path, title, phase, page: Page }) => (
          <Route
            key={path}
            path={path}
            element={
              Page ? (
                <Suspense fallback={<PageLoading />}>
                  <Page />
                </Suspense>
              ) : (
                <PlaceholderPage title={title} phase={phase} />
              )
            }
          />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
