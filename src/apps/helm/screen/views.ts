import type { HelmView } from '@apps/helm/types';

export type BrowseImportance = 'lead' | 'major' | 'minor';

export interface BrowseTile {
  view: HelmView;
  importance: BrowseImportance;
  /** A tile that is big only while it has something waiting; null for a fixed size. */
  grows: 'openQuestions' | null;
}

type CountOf<
  Tiles extends readonly BrowseTile[],
  Importance extends BrowseImportance,
> = Tiles extends readonly [
  infer Head extends BrowseTile,
  ...infer Rest extends readonly BrowseTile[],
]
  ? Head['importance'] extends Importance
    ? [Head, ...CountOf<Rest, Importance>]
    : CountOf<Rest, Importance>
  : [];

type ValidTiles<Tiles extends readonly BrowseTile[]> = CountOf<
  Tiles,
  'lead'
>['length'] extends 0 | 1
  ? CountOf<Tiles, 'major'>['length'] extends 0 | 1 | 2 | 3
    ? Tiles
    : never
  : never;

const TILES = [
  { view: 'today', importance: 'lead', grows: null },
  { view: 'inbox', importance: 'major', grows: 'openQuestions' },
] as const satisfies readonly BrowseTile[];

/** More than one lead or three major tiles makes `ValidTiles` `never`, so this `satisfies`, and `npm run typecheck`, fails. */
export const BROWSE_TILES = TILES satisfies ValidTiles<typeof TILES>;

/** Connected apps, Settings and Activity join once their screens exist. */
export const BROWSE_FOOT: readonly HelmView[] = [];

export const VIEW_KINDS = {
  home: 'home',
  today: 'content',
  inbox: 'content',
} satisfies Record<HelmView, 'home' | 'content' | 'utility'>;
