import { useAppSelector } from '@/store';
import { selectPurposeEmojis } from '@apps/runway/store/selectors/runwaySelectors';
import { resolveItemEmoji } from '@apps/runway/utils/purposeEmoji';

/** The emoji a bill or envelope wears on every surface: its own, else its purpose's. */
export function useItemEmoji(own: string | null, groupId: string | null) {
  const purposeEmojis = useAppSelector(selectPurposeEmojis);
  return resolveItemEmoji(own, groupId, purposeEmojis);
}
