/** A saved meal written before favorites has no key, which reads as not starred. */
export const isStarred = (item: { isFavorite?: boolean | null }) =>
  item.isFavorite === true;

/** Starred items first, each group keeping the order it came in, so the list's own sort still decides within them. */
export const sortFavoritesFirst = <T extends { isFavorite?: boolean | null }>(
  items: readonly T[],
) => {
  const result = [
    ...items.filter((item) => isStarred(item)),
    ...items.filter((item) => !isStarred(item)),
  ];

  return result;
};

/** A tap on a star is ignored while the previous write for it hasn't shown yet (`pending` is the value that write asked for), so a double tap can't read stale state; a later deliberate tap goes through. */
export const shouldIgnoreStarTap = (pending: boolean | null, shown: boolean) =>
  pending !== null && pending !== shown;
