import { useMarkAppEntered } from '@/hooks/useAppEntered';

/**
 * Placed only where an app's own screens render, never beside its loading, sign-in, landing,
 * locked or error states, so what waits for the person to be inside (What's new) waits for it.
 */
function AppEnteredMark({ scope }: { scope: string }) {
  useMarkAppEntered(scope);
  return null;
}

export default AppEnteredMark;
