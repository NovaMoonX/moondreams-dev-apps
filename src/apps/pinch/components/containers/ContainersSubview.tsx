import { useMemo, useState } from 'react';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Plus, X } from 'lucide-react';

import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
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
import { finishedContainersQueryOptions } from '@apps/pinch/queries/containerQueries';
import {
  selectContainers,
  selectMealsById,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { Container, ContainerPlace } from '@apps/pinch/types';
import { searchByName } from '@apps/pinch/utils/catalogSearch';
import {
  getContainerTitle,
  getPreparedSummary,
} from '@apps/pinch/utils/containers';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

type ListView = 'stock' | 'finished';

const HIDDEN_WORTH_A_BUTTON = 3;

interface ContainersSubviewProps {
  uid: string;
  recipeId: string | null;
  mealId: string | null;
}

const isOfScope = (
  container: Container,
  recipeId: string | null,
  mealId: string | null,
) => {
  if (recipeId !== null) return container.recipeId === recipeId;
  if (mealId !== null) return container.mealId === mealId;
  return true;
};

/** What is in the fridge and freezer, soonest eat-by first in each, and a Finished view of what was eaten or thrown out. */
function ContainersSubview({ uid, recipeId, mealId }: ContainersSubviewProps) {
  const { closeSubview } = usePinchOverlay();
  const { isReady, loadError } = useContainerActions(uid);
  const containers = useAppSelector(selectContainers);
  const recipesById = useAppSelector(selectRecipesById);
  const mealsById = useAppSelector(selectMealsById);
  const [view, setView] = useState<ListView>('stock');
  const [scope, setScope] = useState({ recipeId, mealId });
  const [query, setQuery] = useState('');
  const [limits, setLimits] = useState<Record<ContainerPlace, number>>({
    FRIDGE: CONTAINER_LIST_PAGE_SIZE,
    FREEZER: CONTAINER_LIST_PAGE_SIZE,
  });
  const [finishedCount, setFinishedCount] = useState(
    CONTAINER_FINISHED_PAGE_SIZE,
  );
  const [open, setOpen] = useState<Container | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const finishedQuery = useQuery({
    ...finishedContainersQueryOptions(uid, finishedCount),
    enabled: view === 'finished',
    placeholderData: keepPreviousData,
  });

  const inScope = useMemo(
    () =>
      containers.filter((container) =>
        isOfScope(container, scope.recipeId, scope.mealId),
      ),
    [containers, scope],
  );
  const summary = useMemo(() => getPreparedSummary(inScope), [inScope]);
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

  const finished = useMemo(
    () =>
      (finishedQuery.data ?? []).filter((container) =>
        isOfScope(container, scope.recipeId, scope.mealId),
      ),
    [finishedQuery.data, scope],
  );

  const scopeName =
    scope.recipeId !== null
      ? recipesById.get(scope.recipeId)?.title
      : scope.mealId !== null
        ? mealsById.get(scope.mealId)?.name
        : undefined;
  const clearScope = () => setScope({ recipeId: null, mealId: null });

  const getSubtitle = () => {
    if (view === 'finished' || summary.containerCount === 0) return undefined;
    const containerText = `${summary.containerCount} ${summary.containerCount === 1 ? 'container' : 'containers'}`;
    return `${formatServings(summary.fridgeServings + summary.freezerServings)} in ${containerText}`;
  };

  const renderRow = (container: Container) => (
    <li key={container.id}>
      <ContainerRow
        container={container}
        title={getContainerTitle(container, recipesById, mealsById)}
        onOpen={setOpen}
      />
    </li>
  );

  const getStockBody = () => {
    if (loadError !== null) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Your prepared meals couldn't load just now.
        </p>
      );
    }
    if (!isReady) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Loading your prepared meals…
        </p>
      );
    }
    if (inScope.length === 0) {
      return (
        <div className='space-y-3 py-6 text-center'>
          <p className='text-muted-foreground text-sm wrap-break-word'>
            {scopeName
              ? `Nothing from ${scopeName} is in the fridge or freezer.`
              : 'Nothing is put away yet. When you make extra, put some in the fridge or freezer and it shows up here.'}
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

    return (
      <div className='space-y-4'>
        {CONTAINER_PLACES.map((place) => {
          const rows = shown.filter((container) => container.place === place);
          if (rows.length === 0) return null;

          const limit = limits[place];
          const visible =
            rows.length - limit > HIDDEN_WORTH_A_BUTTON ? limit : rows.length;
          return (
            <section key={place} aria-label={CONTAINER_PLACE_LABELS[place]}>
              <SectionDivider
                label={`${CONTAINER_PLACE_EMOJIS[place]} ${CONTAINER_PLACE_LABELS[place]}`}
                trailing={
                  <span className='text-muted-foreground text-sm tabular-nums'>
                    {rows.length}
                  </span>
                }
              />
              <ul className='divide-border divide-y'>
                {rows.slice(0, visible).map(renderRow)}
              </ul>
              {visible < rows.length && (
                <Button
                  type='button'
                  variant='tertiary'
                  className='h-10 justify-start px-0!'
                  onClick={() =>
                    setLimits((current) => ({
                      ...current,
                      [place]: current[place] + CONTAINER_LIST_PAGE_SIZE,
                    }))
                  }
                >
                  Show{' '}
                  {Math.min(CONTAINER_LIST_PAGE_SIZE, rows.length - visible)}{' '}
                  more
                </Button>
              )}
            </section>
          );
        })}
      </div>
    );
  };

  const getFinishedBody = () => {
    if (finishedQuery.isError) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Finished meals couldn't load just now.
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
            : 'Nothing is finished yet. What you eat or throw out is kept here.'}
        </p>
      );
    }

    const hasMore = finishedQuery.data.length >= finishedCount;
    return (
      <div className='space-y-1'>
        <ul className='divide-border divide-y'>{finished.map(renderRow)}</ul>
        {hasMore && (
          <Button
            type='button'
            variant='tertiary'
            className='h-10 justify-start px-0!'
            loading={finishedQuery.isFetching}
            onClick={() =>
              setFinishedCount((count) => count + CONTAINER_FINISHED_PAGE_SIZE)
            }
          >
            Show {CONTAINER_FINISHED_PAGE_SIZE} more
          </Button>
        )}
      </div>
    );
  };

  return (
    <Subview title='Prepared meals' onClose={closeSubview}>
      <div className='space-y-4'>
        <SectionHeader
          title='Prepared meals'
          subtitle={getSubtitle()}
          action={
            <Button
              type='button'
              size='sm'
              rounded='full'
              className='gap-1'
              aria-label='Add a container'
              disabled={!isReady}
              onClick={() => setIsAdding(true)}
            >
              <Plus className='h-4 w-4' aria-hidden='true' />
              Add
            </Button>
          }
        />
        <div className='flex flex-wrap items-center gap-x-2 gap-y-3'>
          <PillGroup
            label='Which containers'
            options={[
              { value: 'stock', label: 'In stock' },
              { value: 'finished', label: 'Finished' },
            ]}
            value={view}
            onChange={setView}
            isThin
          />
          {scopeName && (
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              rounded='full'
              aria-label={`Show everything, not only ${scopeName}`}
              className="bg-accent text-accent-foreground! relative h-6! min-h-0! max-w-full gap-1 px-2.5 py-0! text-xs font-normal before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
              onClick={clearScope}
            >
              <span className='truncate'>Only {scopeName}</span>
              <X className='h-3 w-3 shrink-0' aria-hidden='true' />
            </Button>
          )}
        </div>
        {view === 'stock' && inScope.length >= LIST_SEARCH_THRESHOLD && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder='Search your prepared meals'
          />
        )}
        {view === 'stock' ? getStockBody() : getFinishedBody()}
      </div>
      {open && (
        <ContainerSheet
          key={open.id}
          uid={uid}
          containerId={open.id}
          finished={open.status === 'DONE' ? open : null}
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
