import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  keepPreviousData,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  Ban,
  Check,
  Eraser,
  History,
  ListChecks,
  Plus,
  Refrigerator,
  Snowflake,
  Utensils,
  X,
} from 'lucide-react';

import HeaderIconButton from '@/components/HeaderIconButton';
import IntroCard from '@/components/IntroCard';
import LabelChip from '@/components/LabelChip';
import Pill from '@/components/Pill';
import { PillGroup } from '@/components/PillGroup';
import PromptRow from '@/components/PromptRow';
import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import SelectionBar from '@/components/SelectionBar';
import Subview from '@/components/Subview';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useIsShortScreen } from '@/hooks/useIsShortScreen';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useOnTabReturn } from '@/hooks/useOnTabReturn';
import { useSelection } from '@/hooks/useSelection';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import ContainerFormSheet from '@apps/pinch/components/containers/ContainerFormSheet';
import ContainerRow from '@apps/pinch/components/containers/ContainerRow';
import ContainerSheet from '@apps/pinch/components/containers/ContainerSheet';
import {
  CONTAINER_EMOJI,
  CONTAINER_FINISHED_PAGE_SIZE,
  CONTAINER_LIST_PAGE_SIZE,
  CONTAINER_PLACE_EMOJIS,
  CONTAINER_PLACE_LABELS,
  CONTAINER_PLACES,
  LIST_SEARCH_THRESHOLD,
} from '@apps/pinch/constants';
import { useContainerActions } from '@apps/pinch/hooks/useContainerActions';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  containerKeys,
  finishedContainersQueryOptions,
  hasSeenFinished,
  OfflineEmptyReadError,
  scopedContainersQueryOptions,
} from '@apps/pinch/queries/containerQueries';
import {
  selectContainers,
  selectMealsById,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { Container, ContainerPlace, Meal } from '@apps/pinch/types';
import { searchByName } from '@apps/pinch/utils/catalogSearch';
import {
  getBatchKey,
  getBulkNames,
  getClearOutMessage,
  getContainerTitle,
  getFinishedDoor,
  getFinishedRead,
  getLandingPlace,
  getNamesLine,
  getPastDueBoxes,
  getPastDueSplitText,
  getPastDueText,
  getPlacedTitle,
  getSelectionNote,
  getSelectionPrimary,
  getSelectionTitle,
  getSharedPlace,
  getTossAction,
  getTossConfirmNote,
  getTossConfirmTitle,
  groupBatches,
  type BulkAction,
} from '@apps/pinch/utils/containers';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

const HIDDEN_WORTH_A_BUTTON = 3;
const VERY_SHORT_SCREEN_MAX_HEIGHT = 499;

const sumServings = (containers: Container[]) =>
  containers.reduce((sum, container) => sum + container.servings, 0);

interface ActNote {
  place: ContainerPlace;
  text: string;
  isError: boolean;
}

interface ContainersSubviewProps {
  uid: string;
  recipeId: string | null;
  mealId: string | null;
  place: ContainerPlace | null;
}

interface Scope {
  recipeId: string | null;
  mealId: string | null;
}

interface OpenSheet {
  ids: string[];
  batchKey: string | null;
  finished: Container | null;
}

const getRecipeIdsOf = (meal: Meal | undefined) =>
  Array.from(
    new Set(
      (meal?.items ?? [])
        .filter((item) => item.kind === 'RECIPE')
        .map((item) => item.refId),
    ),
  );

const getScopeLookups = (scope: Scope, meal: Meal | undefined) => {
  if (scope.recipeId !== null) {
    return [{ field: 'recipeId' as const, id: scope.recipeId }];
  }
  return scope.mealId === null
    ? []
    : [
        { field: 'mealId' as const, id: scope.mealId },
        ...getRecipeIdsOf(meal).map((id) => ({
          field: 'recipeId' as const,
          id,
        })),
      ];
};

const isContainerOfScope = (
  container: Container,
  scope: Scope,
  mealRecipeIds: Set<string>,
) => {
  if (scope.recipeId !== null) return container.recipeId === scope.recipeId;
  if (scope.mealId === null) return true;
  return (
    container.mealId === scope.mealId ||
    (container.recipeId !== null && mealRecipeIds.has(container.recipeId))
  );
};

const combineScoped = (
  results: { data?: Container[]; isError: boolean; error: unknown }[],
) => ({
  data: results.some((result) => result.data === undefined)
    ? undefined
    : results.flatMap((result) => result.data ?? []),
  isError: results.some((result) => result.isError),
  error: results.find((result) => result.isError)?.error ?? null,
});

function ContainersSubview({
  uid,
  recipeId,
  mealId,
  place,
}: ContainersSubviewProps) {
  const { closeSubview } = usePinchOverlay();
  const { confirm } = useActionModal();
  const { isReady, loadError, clearOut, changeInPlace } =
    useContainerActions(uid);
  const selection = useSelection();
  const { isBelow } = useMediaQuery();
  const isVeryShort = useIsShortScreen(VERY_SHORT_SCREEN_MAX_HEIGHT);
  const containers = useAppSelector(selectContainers);
  const recipesById = useAppSelector(selectRecipesById);
  const mealsById = useAppSelector(selectMealsById);
  const [pick, setPick] = useState<ContainerPlace | null>(place);
  const [isFinishedView, setIsFinishedView] = useState(false);
  const [scope, setScope] = useState({ recipeId, mealId });
  const [query, setQuery] = useState('');
  const [limits, setLimits] = useState<Record<ContainerPlace, number>>({
    FRIDGE: CONTAINER_LIST_PAGE_SIZE,
    FREEZER: CONTAINER_LIST_PAGE_SIZE,
  });
  const [finishedCount, setFinishedCount] = useState(
    CONTAINER_FINISHED_PAGE_SIZE,
  );
  const [scopedLimit, setScopedLimit] = useState(CONTAINER_FINISHED_PAGE_SIZE);
  const [open, setOpen] = useState<OpenSheet | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [clearing, setClearing] = useState<ContainerPlace | null>(null);
  const [acting, setActing] = useState<BulkAction['kind'] | null>(null);
  const [actNote, setActNote] = useState<ActNote | null>(null);

  const isScoped = scope.recipeId !== null || scope.mealId !== null;
  const scopeMeal =
    scope.mealId === null ? undefined : mealsById.get(scope.mealId);
  const lookups = getScopeLookups(scope, scopeMeal);
  const mealRecipeIds = new Set(getRecipeIdsOf(scopeMeal));
  const hasStockInScope = containers.some((container) =>
    isContainerOfScope(container, scope, mealRecipeIds),
  );
  // Whether anything is finished decides if the door to it shows; a recipe's or meal's own read can be big, so it waits until that scope has nothing in stock.
  const needsFinished =
    isFinishedView ||
    (isReady && loadError === null && (!isScoped || !hasStockInScope));
  const latestFinished = useQuery({
    ...finishedContainersQueryOptions(uid, finishedCount),
    enabled: needsFinished && !isScoped,
    placeholderData: keepPreviousData,
  });
  const scopedFinished = useQueries({
    queries: lookups.map(({ field, id }) => ({
      ...scopedContainersQueryOptions(uid, field, id),
      enabled: needsFinished,
    })),
    combine: combineScoped,
  });
  const finishedQuery = isScoped ? scopedFinished : latestFinished;
  const [hasSeen] = useState(() => hasSeenFinished(uid));
  const queryClient = useQueryClient();
  const networkStatus = useNetworkStatus();
  const retryFailedReads = useCallback(() => {
    void queryClient.refetchQueries({
      queryKey: containerKeys.all(uid),
      type: 'active',
      predicate: (query) => query.state.status === 'error',
    });
  }, [queryClient, uid]);
  useOnTabReturn(retryFailedReads);
  useEffect(() => {
    if (networkStatus === 'reconnected') retryFailedReads();
  }, [networkStatus, retryFailedReads]);

  const isOfScope = useMemo(() => {
    const recipeIds = new Set(getRecipeIdsOf(scopeMeal));
    return (container: Container) =>
      isContainerOfScope(container, scope, recipeIds);
  }, [scope, scopeMeal]);

  const inScope = useMemo(
    () => containers.filter(isOfScope),
    [containers, isOfScope],
  );
  const landingPlace = useMemo(() => getLandingPlace(inScope), [inScope]);
  const basePlace = pick ?? landingPlace;
  const basePlaceRowCount = useMemo(
    () =>
      groupBatches(inScope.filter((container) => container.place === basePlace))
        .length,
    [inScope, basePlace],
  );
  const hasSearch =
    !isFinishedView &&
    (basePlaceRowCount >= LIST_SEARCH_THRESHOLD || query.trim() !== '');
  const trimmed = hasSearch ? query.trim() : '';

  const shown = useMemo(
    () =>
      searchByName(
        inScope.map((container) => ({
          name: getContainerTitle(container, recipesById, mealsById),
          container,
        })),
        trimmed,
      ).map(({ container }) => container),
    [inScope, recipesById, mealsById, trimmed],
  );
  const byPlace = useMemo<Record<ContainerPlace, Container[]>>(
    () => ({
      FRIDGE: shown.filter((container) => container.place === 'FRIDGE'),
      FREEZER: shown.filter((container) => container.place === 'FREEZER'),
    }),
    [shown],
  );
  const batchesByPlace = useMemo(
    () => ({
      FRIDGE: groupBatches(byPlace.FRIDGE),
      FREEZER: groupBatches(byPlace.FREEZER),
    }),
    [byPlace],
  );

  // Until the person picks, the place holding more of what wants a look; while a search is typed, an empty place gives way to the other one; a place they picked stays, even empty.
  const getShownPlace = (): ContainerPlace => {
    const preferred = basePlace;
    const other = preferred === 'FRIDGE' ? 'FREEZER' : 'FRIDGE';
    const isAuto = pick === null || trimmed !== '';
    if (byPlace[preferred].length > 0 || !isAuto) return preferred;
    return byPlace[other].length > 0 ? other : preferred;
  };
  const shownPlace = getShownPlace();
  const viewOptions = [
    ...CONTAINER_PLACES.map((place) => ({
      value: place,
      emoji: CONTAINER_PLACE_EMOJIS[place],
      label: CONTAINER_PLACE_LABELS[place],
      detail:
        byPlace[place].length > 0
          ? formatServings(sumServings(byPlace[place]))
          : undefined,
    })),
  ];

  const handleOpen = useCallback((boxes: Container[]) => {
    const [first] = boxes;
    const isFinished = first.status === 'DONE';
    setOpen({
      ids: boxes.map(({ id }) => id),
      batchKey: isFinished ? null : getBatchKey(first),
      finished: isFinished ? first : null,
    });
    if (!isFinished) setPick((current) => current ?? first.place);
  }, []);

  const finished = useMemo(
    () =>
      isScoped
        ? Array.from(
            new Map(
              (scopedFinished.data ?? [])
                .filter((container) => container.status === 'DONE')
                .map((container) => [container.id, container]),
            ).values(),
          ).sort((a, b) => b.updatedAt - a.updatedAt)
        : (latestFinished.data ?? []),
    [isScoped, scopedFinished.data, latestFinished.data],
  );

  const scopeName =
    scope.recipeId !== null
      ? recipesById.get(scope.recipeId)?.title
      : scope.mealId !== null
        ? mealsById.get(scope.mealId)?.name
        : undefined;
  const clearScope = () => setScope({ recipeId: null, mealId: null });

  const twins = useMemo(() => {
    const counts = groupBatches(inScope).reduce((map, { boxes: [first] }) => {
      const key = `${first.place}|${getContainerTitle(first, recipesById, mealsById)}`;
      return map.set(key, (map.get(key) ?? 0) + 1);
    }, new Map<string, number>());
    return new Set(
      [...counts].filter(([, count]) => count > 1).map(([key]) => key),
    );
  }, [inScope, recipesById, mealsById]);

  const handleClear = async (place: ContainerPlace) => {
    const inPlace = containers.filter((container) => container.place === place);
    const placeWord = CONTAINER_PLACE_LABELS[place].toLowerCase();
    setPick(place);
    setActNote(null);
    const isConfirmed = await confirm({
      title: `Clear out the ${placeWord}?`,
      message: getClearOutMessage(inPlace.length, sumServings(inPlace), place),
      confirmText: `Clear out the ${placeWord}`,
      cancelText: inPlace.length === 1 ? 'Keep it' : 'Keep them',
      destructive: true,
    });
    if (!isConfirmed) return;

    setClearing(place);
    try {
      const result = await clearOut(
        place,
        inPlace.map(({ id }) => id),
      );
      if (result === undefined) return;
      if (result.error !== null) {
        setActNote({ place, text: result.error, isError: true });
      } else if (result.count === 0) {
        setActNote({
          place,
          text: 'Nothing was left there to clear out.',
          isError: false,
        });
      }
    } catch (error) {
      setActNote({
        place,
        text: getErrorMessage(error, "Couldn't clear it out."),
        isError: true,
      });
    } finally {
      setClearing((current) => (current === place ? null : current));
    }
  };

  const isSelecting = selection.isActive;
  const shownBoxes = byPlace[shownPlace];
  const pastBoxes = useMemo(() => getPastDueBoxes(shown), [shown]);
  const selectedBoxes = shown.filter((box) => selection.ids.has(box.id));
  const toggleBoxes = selection.toggle;
  const handleToggle = useCallback(
    (boxes: Container[]) => toggleBoxes(boxes.map(({ id }) => id)),
    [toggleBoxes],
  );
  const getTitleOf = (box: Container) =>
    getContainerTitle(box, recipesById, mealsById);

  const confirmToss = (boxes: Container[]) => {
    const isInBoth = getSharedPlace(boxes) === null;
    const { lines, more } = getBulkNames(groupBatches(boxes), (box) =>
      isInBoth ? getPlacedTitle(getTitleOf(box), box.place) : getTitleOf(box),
    );
    return confirm({
      title: getTossConfirmTitle(boxes.length),
      message: (
        <div className='space-y-3 text-left'>
          <ul className='space-y-2'>
            {lines.map(({ title, details }, index) => (
              <li key={index}>
                <span className='block font-medium'>{title}</span>
                <span className='text-muted-foreground flex flex-wrap gap-x-3 text-sm'>
                  {details.map((detail) => (
                    <span key={detail} className='whitespace-nowrap'>
                      {detail}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {more > 0 && (
            <p>
              and {more} more {more === 1 ? 'box' : 'boxes'}
            </p>
          )}
          <p>{getTossConfirmNote(boxes.length)}</p>
        </div>
      ),
      confirmText: getTossAction(boxes.length),
      cancelText: boxes.length === 1 ? 'Keep it' : 'Keep them',
      destructive: true,
    });
  };

  const getCares = (boxes: Container[]) =>
    Object.fromEntries(
      boxes.flatMap(({ recipeId }) => {
        const recipe =
          recipeId === null ? undefined : recipesById.get(recipeId);
        return recipeId === null || recipe === undefined
          ? []
          : [[recipeId, getRecipeCare(recipe)]];
      }),
    );

  const handleAct = async (
    kind: 'EAT' | 'TOSS' | 'MOVE',
    boxes: Container[],
    isPastOnly = false,
  ) => {
    if (acting !== null || boxes.length === 0) return;

    const place =
      kind === 'MOVE' ? (getSharedPlace(boxes) ?? shownPlace) : shownPlace;
    const action: BulkAction = {
      kind,
      from: place,
      isPastOnly,
      isEitherPlace: kind !== 'MOVE',
      cares: kind === 'MOVE' ? getCares(boxes) : undefined,
    };
    if (kind === 'TOSS' && !(await confirmToss(boxes))) return;

    setActNote(null);
    setPick(place);
    setActing(kind);
    try {
      const result = await changeInPlace(
        action,
        boxes.map(({ id }) => id),
        (changedIds) =>
          getNamesLine(
            boxes.filter((box) => changedIds.includes(box.id)).map(getTitleOf),
          ),
      );
      if (result === undefined) return;
      if (result.count > 0) selection.exit();
      if (result.error !== null) {
        setActNote({ place, text: result.error, isError: true });
      } else if (result.count === 0) {
        setActNote({
          place,
          text: result.skippedText ?? 'Nothing was left there to change.',
          isError: false,
        });
      }
    } catch (error) {
      setActNote({
        place,
        text: getErrorMessage(error, "Couldn't save that."),
        isError: true,
      });
    } finally {
      setActing(null);
    }
  };

  const renderRow = (boxes: Container[]) => {
    const [container] = boxes;
    const title = getContainerTitle(container, recipesById, mealsById);
    return (
      <li key={container.id}>
        <ContainerRow
          boxes={boxes}
          title={title}
          isTwin={
            container.status === 'IN_STOCK' &&
            twins.has(`${container.place}|${title}`)
          }
          onOpen={handleOpen}
          isSelecting={isSelecting}
          isSelected={boxes.every((box) => selection.ids.has(box.id))}
          onToggle={handleToggle}
        />
      </li>
    );
  };

  const getStockBody = () => {
    if (loadError !== null) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Your fridge and freezer couldn't load just now.
        </p>
      );
    }
    if (!isReady) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Loading your fridge and freezer…
        </p>
      );
    }
    if (inScope.length === 0) {
      return (
        <div className='space-y-3 py-6 text-center'>
          <p className='text-muted-foreground text-sm wrap-break-word'>
            {scopeName
              ? `Nothing from ${scopeName} is in the fridge or freezer.`
              : 'Nothing in the fridge or freezer right now. When you make extra, put some away and it shows up here.'}
          </p>
          {scopeName && (
            <Button
              type='button'
              variant='secondary'
              className='h-10'
              onClick={clearScope}
            >
              Show everything
            </Button>
          )}
        </div>
      );
    }
    if (shown.length === 0) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm wrap-break-word'>
          Nothing matches “{trimmed}”.
        </p>
      );
    }

    const place = shownPlace;
    const rows = batchesByPlace[place];
    const placeWord = CONTAINER_PLACE_LABELS[place].toLowerCase();
    const note = actNote?.place === place ? actNote : null;
    const noteLine = note && (
      <p
        role={note.isError ? 'alert' : 'status'}
        className={join(
          'text-sm wrap-break-word',
          note.isError ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {note.text}
      </p>
    );
    if (rows.length === 0) {
      return (
        <div className='space-y-1'>
          {noteLine}
          <p className='text-muted-foreground py-6 text-center text-sm wrap-break-word'>
            {scopeName
              ? `Nothing from ${scopeName} is in the ${placeWord}.`
              : `Nothing in the ${placeWord} right now.`}
          </p>
        </div>
      );
    }

    const limit = limits[place];
    const visible =
      rows.length - limit > HIDDEN_WORTH_A_BUTTON ? limit : rows.length;
    return (
      <section aria-label={CONTAINER_PLACE_LABELS[place]}>
        {noteLine}
        <ul className='border-border divide-border mb-1 divide-y rounded-2xl border px-3'>
          {rows.slice(0, visible).map(({ boxes }) => renderRow(boxes))}
        </ul>
        {visible < rows.length && (
          <ShowMoreButton
            onClick={() =>
              setLimits((current) => ({
                ...current,
                [place]: current[place] + CONTAINER_LIST_PAGE_SIZE,
              }))
            }
          >
            Show {Math.min(CONTAINER_LIST_PAGE_SIZE, rows.length - visible)}{' '}
            more
          </ShowMoreButton>
        )}
      </section>
    );
  };

  const getFinishedBody = () => {
    if (finishedQuery.isError) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          {finishedQuery.error instanceof OfflineEmptyReadError
            ? "Couldn't load what you finished while you're offline."
            : "What you finished couldn't load just now."}
        </p>
      );
    }
    if (finishedQuery.data === undefined) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Loading what you finished…
        </p>
      );
    }
    if (finished.length === 0) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm wrap-break-word'>
          {scopeName
            ? `Nothing from ${scopeName} is finished yet.`
            : 'Nothing is finished yet. What you eat, throw out or clear out is kept here.'}
        </p>
      );
    }

    const scopedHidden =
      isScoped && finished.length - scopedLimit > HIDDEN_WORTH_A_BUTTON
        ? finished.length - scopedLimit
        : 0;
    const rows = scopedHidden > 0 ? finished.slice(0, scopedLimit) : finished;
    const hasMore = isScoped
      ? scopedHidden > 0
      : finishedQuery.data.length >= finishedCount;
    const moreCount = isScoped
      ? Math.min(CONTAINER_FINISHED_PAGE_SIZE, scopedHidden)
      : CONTAINER_FINISHED_PAGE_SIZE;
    return (
      <div className='space-y-1'>
        <ul className='border-border divide-border divide-y rounded-2xl border px-3'>
          {rows.map((container) => renderRow([container]))}
        </ul>
        {hasMore && (
          <ShowMoreButton
            isLoading={!isScoped && latestFinished.isFetching}
            onClick={() =>
              isScoped
                ? setScopedLimit(
                    (count) => count + CONTAINER_FINISHED_PAGE_SIZE,
                  )
                : setFinishedCount(
                    (count) => count + CONTAINER_FINISHED_PAGE_SIZE,
                  )
            }
          >
            Show {moreCount} more
          </ShowMoreButton>
        )}
      </div>
    );
  };

  const isListShown = isReady && loadError === null;
  const isWhole = isListShown && !isScoped && trimmed === '';
  const canClear = isWhole && shownBoxes.length > 0;
  const canSelect = isListShown && !isFinishedView && shown.length >= 2;
  const hasSwitch = !isFinishedView && isListShown && inScope.length > 0;
  const hasPastDueRow =
    isWhole && !isFinishedView && !isSelecting && pastBoxes.length > 0;
  // The cast makes it a plain boolean: passed as it is, React Compiler treats the call as able to mutate the scope it came from.
  const door = getFinishedDoor({
    isListShown: isListShown && !isFinishedView,
    isScoped,
    hasStockInScope: !!hasStockInScope,
    finishedCount: finished.length,
    read: getFinishedRead(
      finishedQuery.isError,
      finishedQuery.data !== undefined,
    ),
    expectsDoor: !isScoped && hasSeen,
  });
  const getTitle = () => {
    if (isSelecting) return getSelectionTitle(selectedBoxes.length);
    return isFinishedView ? 'What you finished' : 'Fridge & freezer';
  };
  const title = getTitle();
  const switchView = (toFinished: boolean) => {
    setIsFinishedView(toFinished);
    setActNote(null);
    window.scrollTo({ top: 0 });
  };

  const placeWord = CONTAINER_PLACE_LABELS[shownPlace].toLowerCase();
  const tickedPlace = getSharedPlace(selectedBoxes);
  const movePlace = tickedPlace ?? shownPlace;
  const isToFreezer = movePlace === 'FRIDGE';
  const canMove = selectedBoxes.length === 0 || tickedPlace !== null;
  const tickedCounts = {
    fridge: selectedBoxes.filter((box) => box.place === 'FRIDGE').length,
    freezer: selectedBoxes.filter((box) => box.place === 'FREEZER').length,
  };
  const isNarrowed = isScoped || trimmed !== '';
  const isNothingTicked = selectedBoxes.length === 0;
  const isBlocked = isNothingTicked || acting !== null;
  const isEveryTicked = (boxes: Container[]) =>
    boxes.length > 0 && boxes.every((box) => selection.ids.has(box.id));
  const toggleAll = (boxes: Container[]) =>
    toggleBoxes(boxes.map(({ id }) => id));

  const tossAction = {
    key: 'toss',
    label: 'Toss',
    icon: <Ban className='h-4 w-4' aria-hidden='true' />,
    isDisabled: isBlocked,
    isLoading: acting === 'TOSS',
    onClick: () => void handleAct('TOSS', selectedBoxes),
  };
  const eatAction = {
    key: 'eat',
    label: 'Ate it all',
    icon: <Utensils className='h-4 w-4' aria-hidden='true' />,
    isDisabled: isBlocked,
    isLoading: acting === 'EAT',
    onClick: () => void handleAct('EAT', selectedBoxes),
  };
  const isTossLead = getSelectionPrimary(selectedBoxes) === 'TOSS';

  const getOnBack = () => {
    if (isSelecting) return selection.exit;
    return isFinishedView ? () => switchView(false) : undefined;
  };
  const isCompact = isBelow('sm') || isVeryShort;
  const isShortSelect = isSelecting && isVeryShort;
  const isActionOnTitleRow = isSelecting ? isVeryShort : !isBelow('sm');
  const getSelectAllLabel = () => {
    if (isNarrowed) return isCompact ? 'All shown' : 'Select all shown';
    return isCompact
      ? `All in the ${placeWord}`
      : `Select all in the ${placeWord}`;
  };

  const selectPills = isSelecting &&
    isListShown &&
    (pastBoxes.length > 0 || shownBoxes.length > 0) && (
      <div
        role='group'
        aria-label='Select several at once'
        className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2'
      >
        {pastBoxes.length > 0 && (
          <Pill
            isThin
            isSelected={isEveryTicked(pastBoxes)}
            icon={
              isEveryTicked(pastBoxes) ? (
                <Check className='h-3 w-3' aria-hidden='true' />
              ) : undefined
            }
            onClick={() => toggleAll(pastBoxes)}
          >
            {isCompact ? 'All past their date' : 'Select all past their date'}
          </Pill>
        )}
        {shownBoxes.length > 0 && (
          <Pill
            isThin
            isSelected={isEveryTicked(shownBoxes)}
            icon={
              isEveryTicked(shownBoxes) ? (
                <Check className='h-3 w-3' aria-hidden='true' />
              ) : undefined
            }
            onClick={() => toggleAll(shownBoxes)}
          >
            {getSelectAllLabel()}
          </Pill>
        )}
      </div>
    );

  const getHeaderAction = () => {
    if (isFinishedView) return false;
    if (isSelecting) {
      return (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          rounded='full'
          className={join(
            "relative h-7 px-3 after:absolute after:-inset-1.5 after:content-['']",
            !isVeryShort && '[@media(max-height:699px)]:hidden',
          )}
          onClick={selection.exit}
        >
          Cancel
        </Button>
      );
    }
    return (
      <div className='flex items-center gap-3'>
        {door === 'SHOW' && (
          <HeaderIconButton
            icon={<History className='h-4 w-4' aria-hidden='true' />}
            label='What you finished'
            onClick={() => switchView(true)}
          />
        )}
        {door === 'HOLD' && <span className='size-7' aria-hidden='true' />}
        {canSelect && (
          <HeaderIconButton
            icon={<ListChecks className='h-4 w-4' aria-hidden='true' />}
            label='Select boxes'
            onClick={selection.start}
          />
        )}
        {canClear && (
          <HeaderIconButton
            icon={<Eraser className='h-4 w-4' aria-hidden='true' />}
            label={`Clear out the ${placeWord}`}
            isDestructive
            isLoading={clearing === shownPlace}
            onClick={() => void handleClear(shownPlace)}
          />
        )}
        <Button
          type='button'
          size='sm'
          rounded='full'
          className="relative gap-1 after:absolute after:-inset-1.5 after:content-['']"
          aria-label='Add something you put away'
          disabled={!isReady}
          onClick={() => setIsAdding(true)}
        >
          <Plus className='h-4 w-4' aria-hidden='true' />
          Add
        </Button>
      </div>
    );
  };

  return (
    <Subview
      title={title}
      onClose={closeSubview}
      onBack={getOnBack()}
      headerAction={isActionOnTitleRow ? getHeaderAction() : undefined}
    >
      <div className='space-y-4'>
        {isFinishedView && (
          <IntroCard
            icon={CONTAINER_EMOJI}
            lead="Boxes you've used up or cleared out."
          >
            Tap one to see what happened to it.
          </IntroCard>
        )}
        <SectionHeader
          title={title}
          lead={(!isShortSelect && selectPills) || undefined}
          action={isActionOnTitleRow ? undefined : getHeaderAction()}
        />
        {(hasSwitch || scopeName || (isShortSelect && selectPills)) && (
          <div
            className={join(
              'flex items-center',
              isShortSelect ? 'gap-x-3' : 'flex-wrap gap-x-2 gap-y-4',
            )}
          >
            {hasSwitch && (
              <div className='max-w-full min-w-0'>
                <PillGroup
                  label='Fridge or freezer'
                  options={viewOptions}
                  value={shownPlace}
                  onChange={(next) => {
                    setPick(next);
                    setActNote(null);
                  }}
                  isThin
                />
              </div>
            )}
            {scopeName && (
              <LabelChip
                ariaLabel={`Show everything, not only ${scopeName}`}
                icon={<X className='h-3 w-3 shrink-0' aria-hidden='true' />}
                onClick={clearScope}
              >
                {`Only ${scopeName}`}
              </LabelChip>
            )}
            {isShortSelect && selectPills && (
              <div className='shrink-0'>{selectPills}</div>
            )}
          </div>
        )}
        {isSelecting && (
          <p role='status' className='sr-only'>
            {getSelectionTitle(selectedBoxes.length)}
          </p>
        )}
        {hasSearch && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder='Search fridge and freezer'
          />
        )}
        {hasPastDueRow && (
          <PromptRow
            icon='⏳'
            title={getPastDueText(pastBoxes.length)}
            detail={getPastDueSplitText(pastBoxes, shownPlace) ?? undefined}
            isIconHiddenOnSmallest
            actionLabel={getTossAction(pastBoxes.length)}
            isBusy={acting === 'TOSS'}
            isDisabled={acting !== null}
            onAction={() => void handleAct('TOSS', pastBoxes, true)}
          />
        )}
        {isFinishedView ? getFinishedBody() : getStockBody()}
      </div>
      {isSelecting && (
        <SelectionBar
          note={getSelectionNote(selectedBoxes.length, tickedCounts)}
          actions={[
            isTossLead ? eatAction : { ...tossAction, isDestructive: true },
            ...(canMove
              ? [
                  {
                    key: 'move',
                    label: isToFreezer
                      ? 'Put in the freezer'
                      : 'Thaw in the fridge',
                    shortLabel: isToFreezer ? 'Freeze' : 'Thaw',
                    icon: isToFreezer ? (
                      <Snowflake className='h-4 w-4' aria-hidden='true' />
                    ) : (
                      <Refrigerator className='h-4 w-4' aria-hidden='true' />
                    ),
                    isDisabled: isBlocked,
                    isLoading: acting === 'MOVE',
                    onClick: () => void handleAct('MOVE', selectedBoxes),
                  },
                ]
              : []),
          ]}
          primary={isTossLead ? tossAction : eatAction}
        />
      )}
      {open && (
        <ContainerSheet
          key={open.ids[0]}
          uid={uid}
          containerIds={open.ids}
          batchKey={open.batchKey}
          finished={open.finished}
          onClose={() =>
            setOpen((current) => (current === open ? null : current))
          }
        />
      )}
      {isAdding && (
        <ContainerFormSheet
          uid={uid}
          initial={null}
          onClose={() => setIsAdding(false)}
        />
      )}
    </Subview>
  );
}

export default ContainersSubview;
