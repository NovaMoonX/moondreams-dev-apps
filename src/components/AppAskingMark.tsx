import { useMarkAppAsking } from '@/hooks/useAppEntered';

/** Holds What's new back while the sheet it sits beside, one an app opened by itself, is up. */
function AppAskingMark({ scope }: { scope: string }) {
  useMarkAppAsking(scope);
  return null;
}

export default AppAskingMark;
