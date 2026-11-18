import type { MapFilter } from '@apps/helm/utils/circleMap';

export type MapPositions = Record<string, { x: number; y: number }>;
export type MapLayouts = Partial<Record<MapFilter, MapPositions>>;

const FILTERS: readonly MapFilter[] = ['close', 'family', 'everyone'];

// The uid sits after a colon so removing an account from the device sweeps it with the rest of what the device kept for it.
const keyOf = (uid: string) => `helm:circle-map:${uid}`;

const isPoint = (value: unknown): value is { x: number; y: number } =>
  typeof value === 'object' &&
  value !== null &&
  Number.isFinite((value as { x?: unknown }).x) &&
  Number.isFinite((value as { y?: unknown }).y);

const toPositions = (value: unknown): MapPositions =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value).flatMap(([id, point]) =>
          isPoint(point) ? [[id, { x: point.x, y: point.y }]] : [],
        ),
      )
    : {};

/** Where the person dragged people to on this device, per filter; empty when nothing is kept, it cannot be read or it is the older single-set shape. */
export const readMapLayouts = (uid: string): MapLayouts => {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(keyOf(uid)) ?? '{}');
    return typeof kept === 'object' && kept !== null
      ? Object.fromEntries(
          FILTERS.map((filter) => [
            filter,
            toPositions((kept as Record<string, unknown>)[filter]),
          ]),
        )
      : {};
  } catch {
    return {};
  }
};

export const writeMapLayouts = (uid: string, layouts: MapLayouts) => {
  try {
    localStorage.setItem(keyOf(uid), JSON.stringify(layouts));
  } catch {
    // A full or blocked store only means the layout is not kept.
  }
};

export const clearMapLayouts = (uid: string) => {
  try {
    localStorage.removeItem(keyOf(uid));
  } catch {
    // Nothing kept that could be cleared.
  }
};
