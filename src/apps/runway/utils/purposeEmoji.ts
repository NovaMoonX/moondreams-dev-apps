/** The emoji a bill or envelope wears: its own, else its purpose's, else null (the badge then shows the first letter). */
export const resolveItemEmoji = (
  own: string | null,
  groupId: string | null,
  purposeEmojis: ReadonlyMap<string, string>,
) => own ?? (groupId === null ? null : (purposeEmojis.get(groupId) ?? null));

/** The emoji a recorded line wears: the one it was sealed with, else its item's look today. */
export const resolveRecordedEmoji = (
  own: string | null,
  itemId: string,
  looks: ReadonlyMap<string, { emoji: string | null }>,
) => own ?? looks.get(itemId)?.emoji ?? null;
