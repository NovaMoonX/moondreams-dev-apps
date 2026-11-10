/** The saved pins that still name a listed envelope, in the saved order, without repeats. */
export function readHomePins(saved: string[] | null, liveIds: string[]) {
  const live = new Set(liveIds);
  const result = Array.from(new Set(saved ?? [])).filter((id) => live.has(id));
  return result;
}

/** The list with one id swapped with its neighbour; unchanged at either end or when the id is absent. */
export function moveInList(ids: string[], id: string, step: -1 | 1) {
  const from = ids.indexOf(id);
  const to = from + step;
  if (from === -1 || to < 0 || to >= ids.length) return ids;
  const result = ids.map((current, index) => {
    if (index === from) return ids[to];
    if (index === to) return id;
    return current;
  });
  return result;
}

/** Home's tiles: the pinned ones in the person's order, then the rest with money before empty, each group kept in plan order. */
export function orderHomeTiles<T extends { item: { id: string } }>(
  entries: T[],
  pins: string[],
  hasMoney: (entry: T) => boolean,
  count: number,
) {
  const byId = new Map(entries.map((entry) => [entry.item.id, entry]));
  const pinned = pins.flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
  const pinnedIds = new Set(pins);
  const rest = entries.filter((entry) => !pinnedIds.has(entry.item.id));
  const result = [
    ...pinned,
    ...rest.filter(hasMoney),
    ...rest.filter((entry) => !hasMoney(entry)),
  ].slice(0, count);
  return result;
}
