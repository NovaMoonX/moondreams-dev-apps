import { layHeldLists, type HeldWrite } from '@/utils/heldWrites';
import type { OpenStyle } from '@apps/helm/store/listeners/styleListener';
import type {
  OpenFact,
  OpenMedia,
  OpenNote,
  OpenPlace,
  OpenProcedure,
  OpenProject,
  OpenRun,
  OpenTask,
  OpenTopic,
  OpenWho,
} from '@apps/helm/types';

/** Each kind of record a transaction's write can be held for, by the opened shape its listeners deliver. */
export interface HelmHeldItems {
  tasks: OpenTask;
  facts: OpenFact;
  who: OpenWho;
  places: OpenPlace;
  projects: OpenProject;
  notes: OpenNote;
  topics: OpenTopic;
  procedures: OpenProcedure;
  runs: OpenRun;
  media: OpenMedia;
  style: OpenStyle;
}

export type HelmHeldKind = keyof HelmHeldItems;

/** Each listener list a hold is laid over, by the shape it holds. */
export interface HelmHeldLists {
  openTasks: OpenTask;
  projectTasks: OpenTask;
  facts: OpenFact;
  who: OpenWho;
  places: OpenPlace;
  projects: OpenProject;
  notes: OpenNote;
  topics: OpenTopic;
  procedures: OpenProcedure;
  openRuns: OpenRun;
  media: OpenMedia;
  style: OpenStyle;
}

export type HelmListName = keyof HelmHeldLists;

interface ListRule<T> {
  /** The listener's own query, so a hold shows only where the list would show the record. */
  belongs: (item: T) => boolean;
  /** The listener's order, so a held new record sits where it will land. */
  order?: (a: T, b: T) => number;
}

type KindLists = {
  [K in HelmHeldKind]: Partial<
    Record<HelmListName, ListRule<HelmHeldItems[K]>>
  >;
};

const FACT_STATUSES = new Set(['confirmed', 'inferred', 'superseded']);

const always = () => true;

const newestFirst = (a: { createdAt: number }, b: { createdAt: number }) =>
  b.createdAt - a.createdAt;

export const HELM_HELD_LISTS: KindLists = {
  tasks: {
    openTasks: {
      belongs: (task) => task.status === 'open',
      order: newestFirst,
    },
    projectTasks: { belongs: (task) => task.projectId !== null },
  },
  facts: {
    facts: {
      belongs: (fact) => FACT_STATUSES.has(fact.status),
      order: newestFirst,
    },
  },
  who: { who: { belongs: always } },
  places: { places: { belongs: always } },
  projects: { projects: { belongs: always } },
  notes: { notes: { belongs: always, order: newestFirst } },
  topics: { topics: { belongs: always } },
  procedures: { procedures: { belongs: always, order: newestFirst } },
  runs: { openRuns: { belongs: (run) => run.finishedAt === null } },
  media: { media: { belongs: always } },
  style: { style: { belongs: always } },
};

export const HELM_HELD_KINDS = Object.keys(HELM_HELD_LISTS) as HelmHeldKind[];

/** The kind whose holds a list shows. */
export const kindOfList = (list: HelmListName): HelmHeldKind =>
  HELM_HELD_KINDS.find((kind) => list in HELM_HELD_LISTS[kind])!;

export interface HelmHeldState {
  incoming: { [L in HelmListName]: HelmHeldLists[L][] };
  /** Null until a list's listener has delivered once. */
  deliveredAt: Record<HelmListName, number | null>;
  held: { [K in HelmHeldKind]: HeldWrite<HelmHeldItems[K]>[] };
  landed: Record<HelmHeldKind, Record<string, HelmListName[]>>;
}

const LIST_NAMES = HELM_HELD_KINDS.flatMap(
  (kind) => Object.keys(HELM_HELD_LISTS[kind]) as HelmListName[],
);

export const emptyHelmHeld = (): HelmHeldState => ({
  incoming: Object.fromEntries(
    LIST_NAMES.map((name) => [name, []]),
  ) as unknown as HelmHeldState['incoming'],
  deliveredAt: Object.fromEntries(
    LIST_NAMES.map((name) => [name, null]),
  ) as HelmHeldState['deliveredAt'],
  held: Object.fromEntries(
    HELM_HELD_KINDS.map((kind) => [kind, []]),
  ) as unknown as HelmHeldState['held'],
  landed: Object.fromEntries(
    HELM_HELD_KINDS.map((kind) => [kind, {}]),
  ) as HelmHeldState['landed'],
});

/** One kind's delivered lists with its holds laid over each, in each list's own order; a list still loading is left as it is. */
export function layHelmKind<K extends HelmHeldKind>(
  kind: K,
  state: HelmHeldState,
  now?: number,
): {
  lists: Partial<Record<HelmListName, HelmHeldItems[K][]>>;
  held: HeldWrite<HelmHeldItems[K]>[];
  landed: Record<string, HelmListName[]>;
} {
  type T = HelmHeldItems[K];
  const rules = Object.entries(HELM_HELD_LISTS[kind]) as [
    HelmListName,
    ListRule<T>,
  ][];
  const laid = layHeldLists<T, HelmListName>({
    lists: Object.fromEntries(
      rules.map(([name, rule]) => [
        name,
        {
          incoming: state.incoming[name] as unknown as T[],
          deliveredAt: state.deliveredAt[name],
          belongs: rule.belongs,
        },
      ]),
    ) as Record<
      HelmListName,
      {
        incoming: T[];
        deliveredAt: number | null;
        belongs: (item: T) => boolean;
      }
    >,
    held: state.held[kind] as HeldWrite<T>[],
    landed: state.landed[kind],
    idOf: (item) => (item as { id: string }).id,
    now,
  });
  return {
    lists: Object.fromEntries(
      rules
        .filter(([name]) => state.deliveredAt[name] !== null)
        .map(([name, rule]) => {
          const list = laid.lists[name];
          return [
            name,
            rule.order !== undefined && laid.held.length > 0
              ? [...list].sort(rule.order)
              : list,
          ];
        }),
    ),
    held: laid.held,
    landed: laid.landed,
  };
}
