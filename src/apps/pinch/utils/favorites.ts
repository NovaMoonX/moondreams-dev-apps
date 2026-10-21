/** A saved meal written before favorites has no key. */
export const isStarred = (item: { isFavorite?: boolean | null }) =>
  item.isFavorite === true;

export const sortFavoritesFirst = <T extends { isFavorite?: boolean | null }>(
  items: readonly T[],
) => {
  const result = [
    ...items.filter((item) => isStarred(item)),
    ...items.filter((item) => !isStarred(item)),
  ];

  return result;
};

/** `pending` is the value the last write asked for; a double tap must not read state that hasn't caught up. */
export const shouldIgnoreStarTap = (pending: boolean | null, shown: boolean) =>
  pending !== null && pending !== shown;
