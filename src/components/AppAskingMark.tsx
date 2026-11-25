import { useMarkAppAsking } from '@/hooks/useAppEntered';

/**
 * Rendered beside a sheet an app opens by itself (a question, a welcome tour), so what waits
 * for the person to be free (What's new) waits until it closes rather than opening over it.
 */
function AppAskingMark({ scope }: { scope: string }) {
  useMarkAppAsking(scope);
  return null;
}

export default AppAskingMark;
