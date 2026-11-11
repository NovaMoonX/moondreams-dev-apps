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
  { view: 'tasks', importance: 'minor', grows: null },
  { view: 'people', importance: 'minor', grows: null },
  { view: 'projects', importance: 'minor', grows: null },
  { view: 'knowledge', importance: 'minor', grows: null },
  { view: 'procedures', importance: 'minor', grows: null },
  { view: 'comingUp', importance: 'minor', grows: null },
  { view: 'howNomosSeesYou', importance: 'minor', grows: null },
] as const satisfies readonly BrowseTile[];

// More than one lead or three major tiles fails to typecheck here.
export const BROWSE_TILES = TILES satisfies ValidTiles<typeof TILES>;

export const BROWSE_FOOT: readonly HelmView[] = [
  'connectedApps',
  'settings',
  'activity',
];

/** Where Back from a view lands; a view that is not listed goes home. */
export const VIEW_PARENTS: Partial<Record<HelmView, HelmView>> = {
  today: 'home',
  inbox: 'home',
  tasks: 'today',
  comingUp: 'today',
  settings: 'home',
  activity: 'settings',
  connectedApps: 'settings',
  connection: 'connectedApps',
  people: 'home',
  who: 'people',
  place: 'home',
  projects: 'home',
  project: 'projects',
  knowledge: 'home',
  topic: 'knowledge',
  procedures: 'home',
  procedure: 'procedures',
  howNomosSeesYou: 'home',
};

export const VIEW_KINDS = {
  home: 'home',
  today: 'content',
  inbox: 'content',
  tasks: 'content',
  comingUp: 'content',
  settings: 'utility',
  activity: 'utility',
  connectedApps: 'utility',
  connection: 'utility',
  people: 'content',
  who: 'content',
  place: 'content',
  projects: 'content',
  project: 'content',
  knowledge: 'content',
  topic: 'content',
  procedures: 'content',
  procedure: 'content',
  howNomosSeesYou: 'content',
} satisfies Record<HelmView, 'home' | 'content' | 'utility'>;
