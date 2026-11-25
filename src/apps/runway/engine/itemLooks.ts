import type { OpenVersion } from '@apps/runway/types';

export interface ItemLook {
  name: string;
  emoji: string | null;
}

/** The emoji a bill or envelope wears: its own, else its purpose's, else null (the badge then shows the first letter). */
export const resolveItemEmoji = (
  own: string | null,
  groupId: string | null,
  purposeEmojis: ReadonlyMap<string, string>,
) => own ?? (groupId === null ? null : (purposeEmojis.get(groupId) ?? null));

/** Every item's name and emoji by id, from its newest version, so a purchase still names an envelope that was renamed or archived. */
export function toItemLooks(
  versions: readonly OpenVersion[],
  purposeEmojis: ReadonlyMap<string, string>,
): Map<string, ItemLook> {
  const newest = versions.reduce<Map<string, OpenVersion>>((acc, version) => {
    const seen = acc.get(version.itemId);
    return seen && seen.createdAt >= version.createdAt
      ? acc
      : acc.set(version.itemId, version);
  }, new Map());
  return new Map(
    [...newest.entries()].map(([id, { payload }]) => [
      id,
      {
        name: payload.name,
        emoji: resolveItemEmoji(
          'emoji' in payload ? payload.emoji : null,
          'groupId' in payload ? payload.groupId : null,
          purposeEmojis,
        ),
      },
    ]),
  );
}
