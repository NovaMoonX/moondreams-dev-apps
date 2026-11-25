export { resolveItemEmoji } from '@apps/runway/engine/itemLooks';

/** The emoji a recorded line wears: the one it was sealed with, else its item's look today. */
export const resolveRecordedEmoji = (
  own: string | null,
  itemId: string,
  looks: ReadonlyMap<string, { emoji: string | null }>,
) => own ?? looks.get(itemId)?.emoji ?? null;
