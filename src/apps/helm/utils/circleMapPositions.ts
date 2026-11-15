export type MapPositions = Record<string, { x: number; y: number }>;

// The uid sits after a colon so removing an account from the device sweeps it with the rest of what the device kept for it.
const keyOf = (uid: string) => `helm:circle-map:${uid}`;

const isPoint = (value: unknown): value is { x: number; y: number } =>
  typeof value === 'object' &&
  value !== null &&
  Number.isFinite((value as { x?: unknown }).x) &&
  Number.isFinite((value as { y?: unknown }).y);

/** Where the person dragged people to on this device; empty when nothing is kept or it cannot be read. */
export const readMapPositions = (uid: string): MapPositions => {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(keyOf(uid)) ?? '{}');
    return typeof kept === 'object' && kept !== null
      ? Object.fromEntries(
          Object.entries(kept).flatMap(([id, point]) =>
            isPoint(point) ? [[id, { x: point.x, y: point.y }]] : [],
          ),
        )
      : {};
  } catch {
    return {};
  }
};

export const writeMapPositions = (uid: string, positions: MapPositions) => {
  try {
    localStorage.setItem(keyOf(uid), JSON.stringify(positions));
  } catch {
    // A full or blocked store only means the layout is not kept.
  }
};

export const clearMapPositions = (uid: string) => {
  try {
    localStorage.removeItem(keyOf(uid));
  } catch {
    // Nothing kept that could be cleared.
  }
};
