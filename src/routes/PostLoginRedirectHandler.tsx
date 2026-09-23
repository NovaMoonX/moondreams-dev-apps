import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@hooks/useAuth';
import { consumePostLoginRedirect } from '@lib/postLoginRedirect';

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
