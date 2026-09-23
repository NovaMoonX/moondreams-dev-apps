import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAppCatalog } from '@hooks/useAppCatalog';
import { useAuth } from '@hooks/useAuth';
import { savePostLoginRedirect } from '@lib/postLoginRedirect';
import Loading from '@ui/Loading';

type ProtectedRouteProps = {
  appId?: string;
  requireAdmin?: boolean;
  children: ReactNode;
};

function ProtectedRoute({ appId, requireAdmin = false, children }: ProtectedRouteProps) {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { apps, loading: catalogLoading } = useAppCatalog();
  const location = useLocation();

  if (authLoading || catalogLoading) {
    return <Loading />;
  }

  if (requireAdmin) {
    if (!user || !isAdmin) {
      return <Navigate to='/' replace />;
    }

    return <>{children}</>;
  }

  if (appId) {
    const hasAccess = apps.some((app) => app.id === appId) || isAdmin;

    if (!hasAccess) {
      if (user) {
        return <Navigate to='/unauthorized' replace />;
      }

      // Not signed in — remember where they were headed (e.g. a join link
      // with an invite code in the query string) so they land back here
      // instead of on the home page once they sign in.
      savePostLoginRedirect(location.pathname + location.search + location.hash);
      return <Navigate to='/' replace />;
    }
  }

  return <>{children}</>;
}

export default ProtectedRoute;
