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
import { Eraser, History, Plus, X } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import EntryTile from '@/components/EntryTile';
import LabelChip from '@/components/LabelChip';
import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import Subview from '@/components/Subview';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useOnTabReturn } from '@/hooks/useOnTabReturn';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import ContainerFormSheet from '@apps/pinch/components/containers/ContainerFormSheet';
import ContainerRow from '@apps/pinch/components/containers/ContainerRow';
import ContainerSheet from '@apps/pinch/components/containers/ContainerSheet';
import {
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
  getClearOutMessage,
  getContainerTitle,
  getEatByState,
  getFinishedDoor,
  getFinishedRead,
  groupBatches,
} from '@apps/pinch/utils/containers';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

const HIDDEN_WORTH_A_BUTTON = 3;

const sumServings = (containers: Container[]) =>
  containers.reduce((sum, container) => sum + container.servings, 0);

interface ClearNote {
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
  const { isReady, loadError, clearOut } = useContainerActions(uid);
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
  const [clearNote, setClearNote] = useState<ClearNote | null>(null);

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
  const trimmed = inScope.length >= LIST_SEARCH_THRESHOLD ? query.trim() : '';

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

  const dueFirstPlace = useMemo<ContainerPlace>(() => {
    const first = inScope
      .filter(
        (container) =>
          container.status === 'IN_STOCK' &&
          getEatByState(container.eatBy) !== 'LATER',
      )
      .reduce<Container | null>(
        (soonest, container) =>
          soonest === null || container.eatBy < soonest.eatBy
            ? container
            : soonest,
        null,
      );
    return first?.place ?? 'FRIDGE';
  }, [inScope]);

  // Until the person picks, the place holding what is due first; while a search is typed, an empty place gives way to the other one; a place they picked stays, even empty.
  const getShownPlace = (): ContainerPlace => {
    const preferred = pick ?? dueFirstPlace;
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
      label:
        byPlace[place].length > 0
          ? `${CONTAINER_PLACE_LABELS[place]} · ${formatServings(sumServings(byPlace[place]))}`
          : CONTAINER_PLACE_LABELS[place],
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
    setClearNote(null);
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
        setClearNote({ place, text: result.error, isError: true });
      } else if (result.count === 0) {
        setClearNote({
          place,
          text: 'Nothing was left there to clear out.',
          isError: false,
        });
      }
    } catch (error) {
      setClearNote({
        place,
        text: getErrorMessage(error, "Couldn't clear it out."),
        isError: true,
      });
    } finally {
      setClearing((current) => (current === place ? null : current));
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
    const note = clearNote?.place === place ? clearNote : null;
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

    const canClear = !isScoped && trimmed === '';
    const limit = limits[place];
    const visible =
      rows.length - limit > HIDDEN_WORTH_A_BUTTON ? limit : rows.length;
    return (
      <section aria-label={CONTAINER_PLACE_LABELS[place]}>
        {canClear && (
          <ActionChips
            className='justify-end pb-1'
            actions={[
              {
                key: 'clear-out',
                icon: <Eraser className='h-4 w-4' />,
                label: `Clear out the ${placeWord}`,
                isDestructive: true,
                isLoading: clearing === place,
                onClick: () => void handleClear(place),
              },
            ]}
          />
        )}
        {noteLine}
        <ul className='divide-border divide-y'>
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
        <ul className='divide-border divide-y'>
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
  const hasSwitch = !isFinishedView && isListShown && inScope.length > 0;
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
  const title = isFinishedView ? 'What you finished' : 'Fridge & freezer';
  const switchView = (toFinished: boolean) => {
    setIsFinishedView(toFinished);
    setClearNote(null);
    window.scrollTo({ top: 0 });
  };

  return (
    <Subview
      title={title}
      onClose={closeSubview}
      onBack={isFinishedView ? () => switchView(false) : undefined}
    >
      <div className='space-y-4'>
        <SectionHeader
          title={title}
          subtitle={
            isFinishedView
              ? "Boxes you've used up or cleared out."
              : 'What you have put away, with what to eat first.'
          }
          action={
            !isFinishedView && (
              <Button
                type='button'
                size='sm'
                rounded='full'
                className='gap-1'
                aria-label='Add something you put away'
                disabled={!isReady}
                onClick={() => setIsAdding(true)}
              >
                <Plus className='h-4 w-4' aria-hidden='true' />
                Add
              </Button>
            )
          }
        />
        {(hasSwitch || scopeName) && (
          <div className='flex flex-wrap items-center gap-x-2 gap-y-4'>
            {hasSwitch && (
              <PillGroup
                label='Fridge or freezer'
                options={viewOptions}
                value={shownPlace}
                onChange={(next) => {
                  setPick(next);
                  setClearNote(null);
                }}
                isThin
              />
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
          </div>
        )}
        {!isFinishedView && inScope.length >= LIST_SEARCH_THRESHOLD && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder='Search the fridge and freezer'
          />
        )}
        {door === 'SHOW' ? (
          <nav
            aria-label='Also in Fridge & freezer'
            className='grid grid-cols-2 gap-3'
          >
            <EntryTile
              icon={<History className='size-4' />}
              label='What you finished'
              onClick={() => switchView(true)}
            />
          </nav>
        ) : (
          door === 'HOLD' && <div className='h-14' aria-hidden='true' />
        )}
        {isFinishedView ? getFinishedBody() : getStockBody()}
      </div>
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
