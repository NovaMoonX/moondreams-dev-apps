import { usePageHistory } from '@/hooks/useBackHistory';

/**
 * Gives a subview its own history entry, so the browser's or phone's back gesture steps back
 * (`onBack`) or closes the subview instead of leaving the page underneath it, and a drawer opened
 * over it takes the gesture first. The entry copies the router's own state so the router sees it as
 * the same location.
 */
export function useSubviewHistory(onClose: () => void, onBack?: () => void) {
  usePageHistory(onBack ?? onClose);
}
