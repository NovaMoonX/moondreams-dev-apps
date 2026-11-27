import { useMarkAppEntered } from '@/hooks/useAppEntered';

/** Marks the app entered: render only where its own screens show, never its loading, sign-in, landing, locked or error states. */
function AppEnteredMark({ scope }: { scope: string }) {
  useMarkAppEntered(scope);
  return null;
}

export default AppEnteredMark;
