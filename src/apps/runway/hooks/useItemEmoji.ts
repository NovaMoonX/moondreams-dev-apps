import { useAppSelector } from '@/store';
import {
  selectItemLooks,
  selectPurposeEmojis,
} from '@apps/runway/store/selectors/runwaySelectors';
import {
  resolveItemEmoji,
  resolveRecordedEmoji,
} from '@apps/runway/utils/purposeEmoji';

/** The emoji a live bill or envelope wears on every surface: its own, else its purpose's. */
export function useItemEmoji(own: string | null, groupId: string | null) {
  return useAppSelector((state) =>
    resolveItemEmoji(own, groupId, selectPurposeEmojis(state)),
  );
}

/** The emoji a recorded or drafted line wears: its sealed one, else its item's look today (an archived purpose's included). */
export function useRecordedEmoji(own: string | null, itemId: string) {
  return useAppSelector((state) =>
    resolveRecordedEmoji(own, itemId, selectItemLooks(state)),
  );
}

/** The live-item resolver for a list that builds its own options. */
export function useLiveEmojiResolver() {
  const purposeEmojis = useAppSelector(selectPurposeEmojis);
  return (own: string | null, groupId: string | null) =>
    resolveItemEmoji(own, groupId, purposeEmojis);
}

/** The recorded-line resolver for a list of lines. */
export function useRecordedEmojiResolver() {
  const looks = useAppSelector(selectItemLooks);
  return (own: string | null, itemId: string) =>
    resolveRecordedEmoji(own, itemId, looks);
}
