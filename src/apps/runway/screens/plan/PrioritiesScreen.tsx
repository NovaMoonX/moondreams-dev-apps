import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  ArrowUpDown,
  ChevronDown,
  ListOrdered,
  TriangleAlert,
} from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import BackLink from '@/components/BackLink';
import EmptyCard from '@/components/EmptyCard';
import LazyMount from '@/components/LazyMount';
import ModalFooterActions from '@/components/ModalFooterActions';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import Subview from '@/components/Subview';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useNow } from '@/hooks/useNow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import BillRow from '@apps/runway/components/BillRow';
import EffectPreview from '@apps/runway/components/EffectPreview';
import EnvelopeTile from '@apps/runway/components/EnvelopeTile';
import GoalRow from '@apps/runway/components/GoalRow';
import type { ItemRowReorder } from '@apps/runway/components/ItemRow';
import NeedsALookRow from '@apps/runway/components/NeedsALookRow';
import {
  PRIORITIES,
  PRIORITIES_WORDS,
  PRIORITY_LABELS,
  RUNWAY_SEARCH_THRESHOLD,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getPace } from '@apps/runway/engine/pace';
import {
  buildMoves,
  isDueBeforeNext,
  isMovable,
  orderPriorities,
  planReorder,
  reconcileWorking,
  type PriorityItem,
  type PrioritySection,
} from '@apps/runway/engine/priorities';
import { effectiveStance, pick } from '@apps/runway/engine/stance';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { reorderItems } from '@apps/runway/store/actions/itemActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  type PreviewChange,
  type PreviewVersion,
} from '@apps/runway/store/selectors/previewSelectors';
import {
  getPriorDays,
  selectBillPayments,
  selectBills,
  selectComingDays,
  selectEnvelopes,
  selectGoals,
  selectHeldByItem,
  selectIsMovesLoaded,
  selectIsPlanItemsLoaded,
  selectIsRecordsReady,
  selectPairedBy,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenVersion, Priority } from '@apps/runway/types';
import { useDeferredLookahead } from '@apps/runway/useDeferredLookahead';
import { describePairedBy } from '@apps/runway/utils/fundingText';
import { describeReorder } from '@apps/runway/utils/priorityText';

const ROWS_PER_CHUNK = 12;
const ESTIMATED_ROW_HEIGHT = 69;
const UNFOLDED_TOTAL = 12;

type Tiers = Record<Priority, string[]>;

interface EditState {
  working: Tiers;
  moved: string[];
  lifted: string | null;
  step: 'edit' | 'confirm';
}

type RankedVersion = Extract<
  OpenVersion,
  { kind: 'bill' | 'envelope' | 'goal' }
>;

interface Entry {
  name: string;
  render: (reorder: ItemRowReorder | undefined) => ReactNode;
}

type Unit =
  | { kind: 'row'; item: PriorityItem; tierIndex: number }
  | { kind: 'slot'; tier: Priority; gap: number; label: string }
  | { kind: 'cut' };

const unitKey = (unit: Unit) =>
  unit.kind === 'row'
    ? unit.item.itemId
    : unit.kind === 'slot'
      ? `slot-${unit.tier}-${unit.gap}`
      : 'cut';

const toSegments = (units: readonly Unit[]) =>
  units.reduce<(Unit[] | 'cut')[]>((acc, unit) => {
    if (unit.kind === 'cut') return [...acc, 'cut'];
    const last = acc.at(-1);
    return Array.isArray(last)
      ? [...acc.slice(0, -1), [...last, unit]]
      : [...acc, [unit]];
  }, []);

const toChunks = (units: readonly Unit[]) =>
  Array.from({ length: Math.ceil(units.length / ROWS_PER_CHUNK) }, (_, index) =>
    units.slice(index * ROWS_PER_CHUNK, (index + 1) * ROWS_PER_CHUNK),
  );

interface PrioritiesScreenProps {
  onClose: () => void;
}

/** Which items get their money first when it runs short: every bill, envelope and goal in the order the plan funds them, with the place the next short pay runs out, and a way to change the order. */
function PrioritiesScreen({ onClose }: PrioritiesScreenProps) {
  const { user } = useAuth();
  const { isHidden } = useValuesHidden();
  const today = todayAsUtcDate(useNow(60_000));
  const isLoaded = useAppSelector(
    (state) =>
      selectIsPlanItemsLoaded(state) &&
      selectIsMovesLoaded(state) &&
      selectIsRecordsReady(state),
  );
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const payments = useAppSelector((state) => selectBillPayments(state, today));
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const balances = useAppSelector(selectBalances);
  const pairedBy = useAppSelector((state) => selectPairedBy(state, today));
  const heldByItem = useAppSelector(selectHeldByItem);
  const stance = useAppSelector(selectStance);
  const planItems = useAppSelector((state) => state.runway.items);
  const versions = useAppSelector((state) => state.runway.versions);
  const lookahead = useDeferredLookahead(today, isLoaded);
  const [query, setQuery] = useState('');
  const [folds, setFolds] = useState<Partial<Record<Priority, boolean>>>({});
  const [edit, setEdit] = useState<EditState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSavingRef = useRef(false);
  const cutRef = useRef<HTMLDivElement | null>(null);
  const hasScrolledRef = useRef(false);

  const paces = useMemo(() => {
    const priorDays = getPriorDays(
      planItems,
      versions,
      today,
      comingDays,
      goals.map(({ version }) => version.payload.funding),
    );
    return Object.fromEntries(
      goals.map(({ item, version }) => [
        item.id,
        getPace(
          { ...version.payload, heldCents: heldByItem[item.id] ?? 0 },
          comingDays.map((day) => ({
            ...day,
            moneyCents: pick(
              effectiveStance(stance, day.stanceOverride),
              day.amount,
              'income',
            ),
          })),
          priorDays,
        ),
      ]),
    );
  }, [goals, heldByItem, comingDays, stance, planItems, versions, today]);

  const shortDay = lookahead?.firstShortDay ?? null;
  const shortNextOn =
    shortDay === null
      ? null
      : (comingDays.find((day) => day.on > shortDay.on)?.on ?? Infinity);
  const nextPayCutoff =
    comingDays.length === 0 ? null : (comingDays[1]?.on ?? Infinity);
  const getDueFirst = (billId: string) => {
    const fromDay =
      shortDay === null || shortNextOn === null
        ? null
        : isDueBeforeNext(shortDay.draft, billId, shortNextOn);
    if (fromDay !== null) return { isFirst: fromDay, cutoffOn: shortNextOn };
    const next = (payments[billId] ?? []).find(
      (payment) => payment.paid === null && payment.dueOn >= today,
    );
    return {
      isFirst:
        nextPayCutoff !== null &&
        next !== undefined &&
        next.dueOn < nextPayCutoff,
      cutoffOn: nextPayCutoff,
    };
  };

  const entries = new Map<string, Entry>([
    ...bills.map(({ item, version }): [string, Entry] => {
      const payload = version.payload;
      const dueFirst = getDueFirst(item.id);
      return [
        item.id,
        {
          name: payload.name,
          render: (reorder) => (
            <BillRow
              key={item.id}
              billId={item.id}
              bill={payload}
              payment={
                (payments[item.id] ?? []).find(
                  (entry) => entry.dueOn >= today,
                ) ?? null
              }
              planStance={stance}
              today={today}
              detailOverride={
                dueFirst.isFirst
                  ? PRIORITIES_WORDS.dueFirst(
                      dueFirst.cutoffOn === null ||
                        dueFirst.cutoffOn === Infinity
                        ? null
                        : formatDateShortUTC(dueFirst.cutoffOn),
                    )
                  : null
              }
              reorder={reorder}
            />
          ),
        },
      ];
    }),
    ...envelopes.map(({ item, version }): [string, Entry] => [
      item.id,
      {
        name: version.payload.name,
        render: (reorder) => (
          <EnvelopeTile
            key={item.id}
            itemId={item.id}
            envelope={version.payload}
            cents={balances.assignedByItem[item.id] ?? 0}
            pairedNote={describePairedBy(pairedBy[item.id] ?? [])}
            today={today}
            reorder={reorder}
          />
        ),
      },
    ]),
    ...goals.map(({ item, version }): [string, Entry] => [
      item.id,
      {
        name: version.payload.name,
        render: (reorder) => (
          <GoalRow
            key={item.id}
            goalId={item.id}
            goal={version.payload}
            pace={paces[item.id]}
            heldCents={heldByItem[item.id] ?? 0}
            today={today}
            reorder={reorder}
          />
        ),
      },
    ]),
  ]);

  const priorityItems: PriorityItem[] = [
    ...bills.map(({ item, version }) => ({
      itemId: item.id,
      kind: 'bill' as const,
      tier: version.payload.priority,
      orderIndex: version.payload.orderIndex,
      createdAt: item.createdAt,
      isRest: false,
      isDueFirst: getDueFirst(item.id).isFirst,
    })),
    ...[...envelopes, ...goals].map(({ item, version }) => ({
      itemId: item.id,
      kind: item.kind as 'envelope' | 'goal',
      tier: version.payload.priority,
      orderIndex: version.payload.orderIndex,
      createdAt: item.createdAt,
      isRest: version.payload.funding.amount.kind === 'rest',
      isDueFirst: false,
    })),
  ];
  const shortOn = shortDay?.on ?? null;
  const total = priorityItems.length;
  const order = orderPriorities(priorityItems, shortDay?.draft ?? null);
  const itemById = new Map(priorityItems.map((item) => [item.itemId, item]));
  const nameOf = (itemId: string) => entries.get(itemId)?.name ?? '';

  const hasSearch = total >= RUNWAY_SEARCH_THRESHOLD && edit === null;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const isSearching = needle !== '';

  const live =
    edit === null
      ? null
      : reconcileWorking(edit.working, order.sections, new Set(edit.moved));
  const liveIds = new Set(Object.values(live ?? {}).flat());
  const movedIds = new Set(
    (edit?.moved ?? []).filter((itemId) => liveIds.has(itemId)),
  );
  const lifted =
    edit?.lifted != null && liveIds.has(edit.lifted) ? edit.lifted : null;
  const assignments =
    live === null ? [] : planReorder(order.sections, live, movedIds);
  const isDirty = assignments.length > 0;
  const originalTiers = new Map(
    priorityItems.map((item) => [item.itemId, item.tier]),
  );
  const summary =
    live === null || !isDirty
      ? ''
      : describeReorder(assignments, movedIds, live, originalTiers, nameOf);
  const changeJson = isDirty
    ? JSON.stringify({
        kind: 'versions',
        versions: buildMoves(
          assignments,
          versions as RankedVersion[],
          today,
        ).flatMap((move) =>
          move.segments.map(
            (segment) =>
              ({
                itemId: move.itemId,
                kind: move.kind,
                effectiveFrom: segment.effectiveFrom,
                effectiveUntil: segment.effectiveUntil,
                changeId: 'what-if',
                payload: {
                  ...segment.payload,
                  priority: move.priority,
                  orderIndex: move.orderIndex,
                },
              }) as PreviewVersion,
          ),
        ),
      } satisfies PreviewChange)
    : null;

  const requestExitEdit = useDiscardGuard({
    isDirty,
    onClose: () => setEdit(null),
    isBusy: isSaving,
    title: PRIORITIES_WORDS.discardTitle,
    message: PRIORITIES_WORDS.discardMessage,
  });

  useEffect(() => {
    if (hasScrolledRef.current || lookahead === null) return;
    if (order.cutIndex === null || window.scrollY > 8 || query.trim() !== '') {
      hasScrolledRef.current = true;
      return;
    }
    const frame = requestAnimationFrame(() => {
      hasScrolledRef.current = true;
      cutRef.current?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [lookahead, order.cutIndex, query]);

  const startEdit = () => {
    setQuery('');
    setEdit({
      working: Object.fromEntries(
        order.sections.map((section) => [
          section.tier,
          section.items.filter(isMovable).map((item) => item.itemId),
        ]),
      ) as Tiers,
      moved: [],
      lifted: null,
      step: 'edit',
    });
  };

  const patchEdit = (change: (current: EditState) => EditState) =>
    setEdit((current) => (current === null ? current : change(current)));

  const placeLifted = (tier: Priority, index: number) => {
    if (live === null || lifted === null) return;
    const without = Object.fromEntries(
      PRIORITIES.map((key) => [key, live[key].filter((id) => id !== lifted)]),
    ) as Tiers;
    patchEdit((current) => ({
      ...current,
      working: {
        ...without,
        [tier]: [
          ...without[tier].slice(0, index),
          lifted,
          ...without[tier].slice(index),
        ],
      },
      moved: current.moved.includes(lifted)
        ? current.moved
        : [...current.moved, lifted],
      lifted: null,
    }));
  };

  const nudge = (itemId: string, tier: Priority, direction: -1 | 1) => {
    if (live === null) return;
    const tierIndex = PRIORITIES.indexOf(tier);
    const list = live[tier];
    const index = list.indexOf(itemId);
    const target = index + direction;
    const crossTo = PRIORITIES[tierIndex + direction] as Priority | undefined;
    const next: Tiers =
      target >= 0 && target < list.length
        ? {
            ...live,
            [tier]: list.map((id, at) =>
              at === index ? list[target] : at === target ? itemId : id,
            ),
          }
        : crossTo === undefined
          ? live
          : {
              ...live,
              [tier]: list.filter((id) => id !== itemId),
              [crossTo]:
                direction === -1
                  ? [...live[crossTo], itemId]
                  : [itemId, ...live[crossTo]],
            };
    patchEdit((current) => ({
      ...current,
      working: next,
      moved: current.moved.includes(itemId)
        ? current.moved
        : [...current.moved, itemId],
    }));
  };

  const save = async () => {
    if (isSavingRef.current || !user || live === null || !isDirty) return;
    isSavingRef.current = true;
    setIsSaving(true);
    setError(null);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await reorderItems(user.uid, encryption, {
        moves: buildMoves(
          assignments,
          store.getState().runway.versions as RankedVersion[],
          today,
        ),
        summary,
        effectiveFrom: today,
      });
      setEdit(null);
    } catch (saveError) {
      setError(getErrorMessage(saveError, PRIORITIES_WORDS.saveFailed));
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const getSections = (): PrioritySection[] => {
    if (live === null) return order.sections;
    return order.sections.map((section) => ({
      ...section,
      items: [
        ...section.items.filter((item) => item.isDueFirst),
        ...live[section.tier].flatMap((id) => itemById.get(id) ?? []),
        ...section.items.filter((item) => item.isRest && !item.isDueFirst),
      ],
    }));
  };

  const getUnits = (section: PrioritySection): Unit[] => {
    if (live === null) {
      return section.items.flatMap((item, index): Unit[] => {
        const isMatch =
          !isSearching || nameOf(item.itemId).toLowerCase().includes(needle);
        if (!isMatch) return [];
        const row: Unit = { kind: 'row', item, tierIndex: index };
        return !isSearching && section.start + index === order.cutIndex
          ? [{ kind: 'cut' }, row]
          : [row];
      });
    }
    const list = live[section.tier];
    const fixedFirst = section.items.filter((item) => item.isDueFirst);
    const fixedLast = section.items.filter(
      (item) => item.isRest && !item.isDueFirst,
    );
    const liftedAt = list.indexOf(lifted ?? '');
    const slotAt = (gap: number): Unit[] => {
      if (lifted === null) return [];
      if (liftedAt >= 0 && (gap === liftedAt || gap === liftedAt + 1))
        return [];
      return [
        {
          kind: 'slot',
          tier: section.tier,
          gap: liftedAt >= 0 && gap > liftedAt ? gap - 1 : gap,
          label:
            gap < list.length
              ? `${PRIORITIES_WORDS.placeHere}, above ${nameOf(list[gap])}`
              : `${PRIORITIES_WORDS.placeHere}, at the end of ${PRIORITY_LABELS[section.tier]}`,
        },
      ];
    };
    return [
      ...fixedFirst.map((item): Unit => ({ kind: 'row', item, tierIndex: -1 })),
      ...list.flatMap((id, index): Unit[] => [
        ...slotAt(index),
        ...(itemById.has(id)
          ? [
              {
                kind: 'row' as const,
                item: itemById.get(id) as PriorityItem,
                tierIndex: index,
              },
            ]
          : []),
      ]),
      ...slotAt(list.length),
      ...fixedLast.map((item): Unit => ({ kind: 'row', item, tierIndex: -1 })),
    ];
  };

  const renderUnit = (unit: Unit, tier: Priority) => {
    if (unit.kind === 'cut') return null;
    if (unit.kind === 'slot') {
      return (
        <li key={unitKey(unit)} className='px-3 py-1'>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className="relative h-8 w-full border-dashed before:absolute before:-inset-1 before:content-['']"
            aria-label={unit.label}
            onClick={() => placeLifted(unit.tier, unit.gap)}
          >
            {PRIORITIES_WORDS.placeHere}
          </Button>
        </li>
      );
    }
    const entry = entries.get(unit.item.itemId);
    if (!entry) return null;
    if (live === null) return entry.render(undefined);
    const list = live[tier];
    const tierRank = PRIORITIES.indexOf(tier);
    const id = unit.item.itemId;
    return entry.render({
      isFixed: unit.item.isDueFirst || unit.item.isRest,
      fixedNote: unit.item.isRest ? PRIORITIES_WORDS.restLast : null,
      isLifted: lifted === id,
      onLift: () =>
        patchEdit((current) => ({
          ...current,
          lifted: current.lifted === id ? null : id,
        })),
      onMoveUp:
        unit.tierIndex === 0 && tierRank === 0
          ? null
          : () => nudge(id, tier, -1),
      onMoveDown:
        unit.tierIndex === list.length - 1 && tierRank === PRIORITIES.length - 1
          ? null
          : () => nudge(id, tier, 1),
    });
  };

  const getStatus = () => {
    if (lookahead === null) {
      return (
        <p className='text-muted-foreground min-h-5 text-sm'>
          {PRIORITIES_WORDS.checking}
        </p>
      );
    }
    if (comingDays.length === 0) {
      return (
        <p className='text-muted-foreground text-sm'>
          {PRIORITIES_WORDS.noIncome}
        </p>
      );
    }
    if (lookahead.firstShortDay === null) {
      return (
        <p className='text-muted-foreground text-sm'>
          {PRIORITIES_WORDS.allCovered}
        </p>
      );
    }
    if (isHidden) return <NeedsALookRow />;
    return (
      <p className='text-muted-foreground text-sm'>
        {PRIORITIES_WORDS.shortOn(
          formatDateShortUTC(lookahead.firstShortDay.on),
        )}
      </p>
    );
  };

  const getDefaultOpen = (section: PrioritySection) => {
    if (section.items.length === 0) return true;
    if (order.cutIndex !== null) {
      return (
        order.cutIndex >= section.start &&
        order.cutIndex < section.start + section.items.length
      );
    }
    if (total <= UNFOLDED_TOTAL) return true;
    return (
      order.sections.find((other) => other.items.length > 0)?.tier ===
      section.tier
    );
  };

  const renderSection = (section: PrioritySection) => {
    const units = getUnits(section);
    const rowCount = units.filter((unit) => unit.kind === 'row').length;
    const isEmptyNow = edit === null && rowCount === 0;
    if (isEmptyNow && (isSearching || section.items.length === 0)) return null;
    const isOpen = isSearching
      ? rowCount > 0
      : (folds[section.tier] ?? getDefaultOpen(section));
    const count = isSearching ? rowCount : section.items.length;
    return (
      <section key={section.tier} className='space-y-2'>
        <SectionDivider
          label={
            <Button
              type='button'
              variant='tertiary'
              size='stripped'
              className="text-muted-foreground! relative inline-flex h-8 items-center gap-1 before:absolute before:-inset-x-2 before:-inset-y-1 before:content-['']"
              aria-expanded={isOpen}
              onClick={() =>
                setFolds((current) => ({ ...current, [section.tier]: !isOpen }))
              }
            >
              {PRIORITY_LABELS[section.tier]} · {count}
              <ChevronDown
                className={join('h-4 w-4', isOpen && 'rotate-180')}
                aria-hidden='true'
              />
            </Button>
          }
        />
        {isOpen && units.length > 0 && (
          <div className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {toSegments(units).flatMap((segment, segmentIndex) =>
              segment === 'cut'
                ? [
                    <div
                      key='cut'
                      ref={cutRef}
                      className='scroll-mt-24 px-3 py-2'
                    >
                      <SectionDivider
                        className='[&>div]:border-(--runway-warning-edge)'
                        label={
                          <span className='inline-flex items-center gap-1.5 text-(--runway-warning-ink)'>
                            <TriangleAlert
                              className='h-3.5 w-3.5'
                              aria-hidden='true'
                            />
                            {isHidden || shortOn === null
                              ? PRIORITIES_WORDS.cutLineHidden
                              : PRIORITIES_WORDS.cutLine(
                                  formatDateShortUTC(shortOn),
                                )}
                          </span>
                        }
                      />
                    </div>,
                  ]
                : toChunks(segment).map((chunk, chunkIndex) => (
                    <div
                      key={`${segmentIndex}-${chunkIndex}`}
                      className='defer-offscreen'
                      style={
                        {
                          '--defer-size': `${chunk.length * ESTIMATED_ROW_HEIGHT}px`,
                        } as CSSProperties
                      }
                    >
                      <LazyMount
                        eager={segmentIndex === 0 && chunkIndex === 0}
                        estimatedHeight={chunk.length * ESTIMATED_ROW_HEIGHT}
                      >
                        <ul className='divide-border divide-y'>
                          {chunk.map((unit) => renderUnit(unit, section.tier))}
                        </ul>
                      </LazyMount>
                    </div>
                  )),
            )}
          </div>
        )}
      </section>
    );
  };

  const getBody = () => {
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground text-sm'>Getting your plan.</p>
      );
    }
    if (total === 0) {
      return (
        <EmptyCard icon={<ListOrdered className='h-5 w-5' />}>
          {PRIORITIES_WORDS.empty}
        </EmptyCard>
      );
    }
    return (
      <div className='space-y-4'>
        {getStatus()}
        {hasSearch && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={PRIORITIES_WORDS.searchPlaceholder}
          />
        )}
        {lifted !== null && (
          <p
            className='text-muted-foreground sticky-day-bar bg-background py-2 text-sm'
            role='status'
          >
            Tap Place here where {nameOf(lifted)} should go.
          </p>
        )}
        {getSections().map(renderSection)}
        {isSearching &&
          !order.sections.some((section) =>
            section.items.some((item) =>
              nameOf(item.itemId).toLowerCase().includes(needle),
            ),
          ) && (
            <p className='text-muted-foreground text-sm'>
              {PRIORITIES_WORDS.noMatch}
            </p>
          )}
      </div>
    );
  };

  if (edit?.step === 'confirm') {
    return (
      <Subview
        title={PRIORITIES_WORDS.title}
        onClose={onClose}
        onBack={() => patchEdit((current) => ({ ...current, step: 'edit' }))}
        headerAction={<ValuesEyeButton />}
      >
        <div className='flex flex-1 flex-col gap-4'>
          <BackLink
            onBack={() =>
              patchEdit((current) => ({ ...current, step: 'edit' }))
            }
          />
          <div className='space-y-1'>
            <ActionTitle>{PRIORITIES_WORDS.confirmTitle}</ActionTitle>
            <p className='text-muted-foreground text-sm break-words'>
              {summary}
            </p>
          </div>
          <EffectPreview changeJson={changeJson} />
          <ModalFooterActions
            note={error}
            rightActions={
              <Button
                type='button'
                className='whitespace-nowrap max-sm:px-3'
                loading={isSaving}
                disabled={isSaving}
                onClick={() => void save()}
              >
                {PRIORITIES_WORDS.confirmSave}
              </Button>
            }
          />
        </div>
      </Subview>
    );
  }

  return (
    <Subview
      title={PRIORITIES_WORDS.title}
      onClose={onClose}
      onBack={edit === null ? onClose : requestExitEdit}
      headerAction={
        <span className='flex items-center gap-1'>
          {edit === null && isLoaded && total > 1 && (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className="relative gap-1.5 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
              onClick={startEdit}
            >
              <ArrowUpDown className='h-4 w-4' aria-hidden='true' />
              {PRIORITIES_WORDS.reorder}
            </Button>
          )}
          <ValuesEyeButton />
        </span>
      }
    >
      <div className='space-y-4'>
        {getBody()}
        {edit !== null && (
          <div className='bg-background border-border sticky bottom-0 z-10 -mx-(--subview-pad) border-t px-(--subview-pad) py-3'>
            <ModalFooterActions
              note={isDirty ? null : PRIORITIES_WORDS.nothingMoved}
              cancelAction={
                <Button
                  type='button'
                  variant='secondary'
                  onClick={requestExitEdit}
                >
                  {PRIORITIES_WORDS.cancel}
                </Button>
              }
              rightActions={
                <Button
                  type='button'
                  className='whitespace-nowrap max-sm:px-3'
                  disabled={!isDirty}
                  onClick={() =>
                    patchEdit((current) => ({ ...current, step: 'confirm' }))
                  }
                >
                  {PRIORITIES_WORDS.save}
                </Button>
              }
            />
          </div>
        )}
      </div>
    </Subview>
  );
}

export default PrioritiesScreen;
