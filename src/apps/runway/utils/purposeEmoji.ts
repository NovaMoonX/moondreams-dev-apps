/** The emoji a bill or envelope wears: its own, else its purpose's, else null (the badge then shows the first letter). */
export const resolveItemEmoji = (
  own: string | null,
  groupId: string | null,
  purposeEmojis: ReadonlyMap<string, string>,
) => own ?? (groupId === null ? null : (purposeEmojis.get(groupId) ?? null));
