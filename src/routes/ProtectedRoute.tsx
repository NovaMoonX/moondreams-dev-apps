import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAppCatalog } from '@hooks/useAppCatalog';
import { useAuth } from '@hooks/useAuth';
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
      return user ? (
        <Navigate to='/unauthorized' replace />
      ) : (
        <Navigate to='/' state={{ from: location }} replace />
      );
    }
  }

  return <>{children}</>;
}

export default ProtectedRoute;
