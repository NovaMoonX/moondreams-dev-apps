import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@hooks/useAuth';
import { consumePostLoginRedirect } from '@lib/postLoginRedirect';

/**
 * Mounted once, app-wide. Whenever the user is signed in and a destination
 * was saved by `ProtectedRoute` (because they hit a gated route, e.g. a join
 * link, while signed out), sends them there instead of leaving them stranded
 * on the home page. `consumePostLoginRedirect` clears the saved value as
 * soon as it's read, so this can only ever redirect once per sign-in —
 * no loops.
 */
function PostLoginRedirectHandler() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    const destination = consumePostLoginRedirect();
    if (destination) {
      navigate(destination, { replace: true });
    }
  }, [loading, user, navigate]);

  return null;
}

export default PostLoginRedirectHandler;
