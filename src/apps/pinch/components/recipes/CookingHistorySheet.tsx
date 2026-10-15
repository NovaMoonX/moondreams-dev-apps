import { useMemo, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft, ChevronRight, NotebookPen } from 'lucide-react';

import FormSheet from '@/components/FormSheet';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import NoteForm from '@apps/pinch/components/notes/NoteForm';
import CookEditView from '@apps/pinch/components/recipes/CookEditView';
import {
  COOK_HISTORY_FIRST_PAGE,
  COOK_HISTORY_PAGE_SIZE,
  SOFT_MAX_COOKS_PER_RECIPE,
} from '@apps/pinch/constants';
import { CONTAINER_EMOJI } from '@apps/pinch/constants';
import { scopedContainersQueryOptions } from '@apps/pinch/queries/containerQueries';
import {
  selectContainersByCookId,
  selectCooksByRecipe,
  selectNotesByRecipe,
  selectNotesLoadError,
  selectPlannedMeals,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { Container, Cook } from '@apps/pinch/types';
import {
  getPutAwayText,
  groupContainersByCook,
} from '@apps/pinch/utils/containers';
import { getCookServings, isCookHistoryFull } from '@apps/pinch/utils/cooks';
import { formatDayTitle, getPlannedDayKey } from '@apps/pinch/utils/dayKeys';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

const NO_COOKS: Cook[] = [];
const HIDDEN_WORTH_A_BUTTON = 3;

type HistoryView =
  | { kind: 'list' }
  | { kind: 'edit'; cookId: string | null; token: number }
  | { kind: 'note'; cookId: string; token: number };

interface CookingHistorySheetProps {
  uid: string;
  recipeId: string;
  onClose: () => void;
}

function CookingHistorySheet({
  uid,
  recipeId,
  onClose,
}: CookingHistorySheetProps) {
  const recipe = useAppSelector(selectRecipesById).get(recipeId);
  const cooks = useAppSelector(selectCooksByRecipe).get(recipeId) ?? NO_COOKS;
  const isLoaded = useAppSelector((state) => state.pinch.cooks.isLoaded);
  const loadError = useAppSelector((state) => state.pinch.cooks.loadError);
  const plannedMeals = useAppSelector(selectPlannedMeals);
  const isNotesReady = useAppSelector(
    (state) =>
      state.pinch.notes.isLoaded && selectNotesLoadError(state) === null,
  );
  const notes = useAppSelector(selectNotesByRecipe).get(recipeId);
  const notedCookIds = useMemo(
    () => new Set((notes ?? []).map((entry) => entry.cookId ?? null)),
    [notes],
  );
  const [view, setView] = useState<HistoryView>({ kind: 'list' });
  const [limit, setLimit] = useState(COOK_HISTORY_FIRST_PAGE);
  const lastToken = useRef(0);

  const stockByCook = useAppSelector(selectContainersByCookId);
  const recipeContainers = useQuery(
    scopedContainersQueryOptions(uid, 'recipeId', recipeId),
  ).data;
  const putAwayByCook = useMemo(() => {
    const merged = new Map<string, Container>(
      (recipeContainers ?? []).map((container) => [container.id, container]),
    );
    stockByCook.forEach((list) =>
      list.forEach((container) => merged.set(container.id, container)),
    );
    return new Map(
      [...groupContainersByCook([...merged.values()])].map(([cookId, list]) => [
        cookId,
        getPutAwayText(list),
      ]),
    );
  }, [recipeContainers, stockByCook]);

  const plannedById = useMemo(
    () => new Map(plannedMeals.map((planned) => [planned.id, planned])),
    [plannedMeals],
  );
  const getPlanNote = (cook: Cook) => {
    if (cook.plannedMealId == null) return null;
    const planned = plannedById.get(cook.plannedMealId);
    return planned
      ? `From your plan for ${formatDayTitle(getPlannedDayKey(planned.date))}`
      : 'From your plan';
  };

  const editing = view.kind === 'edit' ? view : null;
  const editedCook =
    editing !== null && editing.cookId !== null
      ? cooks.find((cook) => cook.id === editing.cookId)
      : undefined;
  const isEditing =
    editing !== null && (editing.cookId === null || editedCook !== undefined);
  const isFull = isCookHistoryFull(cooks.length);
  const openView = (next: (token: number) => HistoryView) => {
    lastToken.current += 1;
    setView(next(lastToken.current));
  };
  const openEdit = (cookId: string | null) =>
    openView((token) => ({ kind: 'edit', cookId, token }));
  const openNote = (cookId: string) =>
    openView((token) => ({ kind: 'note', cookId, token }));
  const closeView = (token: number) =>
    setView((current) =>
      current.kind !== 'list' && current.token === token
        ? { kind: 'list' }
        : current,
    );

  const hidden = cooks.length - limit;
  const visibleCount = hidden > HIDDEN_WORTH_A_BUTTON ? limit : cooks.length;
  const isCollapsible =
    visibleCount === cooks.length &&
    cooks.length > COOK_HISTORY_FIRST_PAGE + HIDDEN_WORTH_A_BUTTON;

  const getBody = () => {
    if (view.kind === 'note') {
      const noteView = view;
      const noteCook = cooks.find((cook) => cook.id === noteView.cookId);
      const closeNote = () => closeView(noteView.token);
      return (
        <div className='space-y-4'>
          <Button
            type='button'
            variant='tertiary'
            className='h-10 gap-1 px-0!'
            onClick={closeNote}
          >
            <ChevronLeft className='h-4 w-4' aria-hidden='true' />
            Back
          </Button>
          <div className='space-y-0.5'>
            <p className='font-medium wrap-break-word'>
              {recipe?.title ?? 'This recipe'}
            </p>
            <p className='text-muted-foreground text-sm'>
              {noteCook
                ? `A note about the cook from ${formatDateShort(noteCook.cookedAt)}`
                : 'A note about a cook'}
            </p>
          </div>
          <NoteForm
            key={noteView.token}
            uid={uid}
            recipeId={recipeId}
            noteId={null}
            initialCookId={noteView.cookId}
            onCancel={closeNote}
            onDone={closeNote}
          />
        </div>
      );
    }
    if (editing !== null && isEditing) {
      return (
        <CookEditView
          key={editing.token}
          uid={uid}
          recipeId={recipeId}
          recipeTitle={recipe?.title ?? 'This recipe'}
          cook={editedCook ?? null}
          defaultServings={getCookServings(recipe?.servings ?? 1)}
          planNote={editedCook ? getPlanNote(editedCook) : null}
          onBack={() => closeView(editing.token)}
          onAddNote={
            editedCook && isNotesReady && !notedCookIds.has(editedCook.id)
              ? () => openNote(editedCook.id)
              : null
          }
        />
      );
    }
    if (loadError !== null) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Your cooking history couldn't load just now.
        </p>
      );
    }
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Loading your cooking history…
        </p>
      );
    }

    return (
      <div className='flex max-h-[max(12rem,calc(92dvh-14rem))] flex-col'>
        <div className='shrink-0 space-y-1 pb-1'>
          <p className='font-medium wrap-break-word'>
            {recipe?.title ?? 'This recipe'}
          </p>
          {isFull ? (
            <p className='text-muted-foreground text-sm'>
              A recipe's history holds up to {SOFT_MAX_COOKS_PER_RECIPE} cooks.
              Delete an older one to add more.
            </p>
          ) : (
            <Button
              type='button'
              variant='tertiary'
              className='h-10 justify-start px-0!'
              onClick={() => openEdit(null)}
            >
              + Add an earlier cook
            </Button>
          )}
        </div>
        {cooks.length === 0 ? (
          <p className='text-muted-foreground py-4 text-center text-sm'>
            No cooks yet. Add the ones you remember.
          </p>
        ) : (
          <ul className='divide-border min-h-0 flex-1 divide-y overflow-y-auto'>
            {cooks.slice(0, visibleCount).map((cook) => {
              const planNote = getPlanNote(cook);
              const putAway = putAwayByCook.get(cook.id) ?? null;
              const day = formatDateShort(cook.cookedAt);
              return (
                <li key={cook.id} className='pb-1'>
                  <Button
                    type='button'
                    variant='tertiary'
                    aria-label={`Change the cook from ${day}`}
                    className='h-auto min-h-12 w-full items-start justify-start gap-3 px-0! py-2.5 text-left'
                    onClick={() => openEdit(cook.id)}
                  >
                    <span className='min-w-0 flex-1'>
                      <span className='text-foreground block font-medium'>
                        <span className='whitespace-nowrap'>{day}</span>
                        {' · '}
                        <span className='whitespace-nowrap'>
                          {formatServings(cook.servings)}
                        </span>
                      </span>
                      {planNote && (
                        <span className='text-muted-foreground block text-xs font-normal wrap-break-word'>
                          {planNote}
                        </span>
                      )}
                      {putAway && (
                        <span className='text-muted-foreground block text-xs font-normal wrap-break-word'>
                          <span aria-hidden='true'>{CONTAINER_EMOJI}</span>{' '}
                          {putAway}
                        </span>
                      )}
                    </span>
                    <ChevronRight
                      className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
                      aria-hidden='true'
                    />
                  </Button>
                  {isNotesReady && !notedCookIds.has(cook.id) && (
                    <Button
                      type='button'
                      variant='tertiary'
                      size='sm'
                      aria-label={`Add a note about the cook from ${day}`}
                      className='-mt-1 h-10 gap-1.5 px-0! text-sm font-normal'
                      onClick={() => openNote(cook.id)}
                    >
                      <NotebookPen className='h-4 w-4' aria-hidden='true' />
                      Add a note
                    </Button>
                  )}
                </li>
              );
            })}
            {(hidden > HIDDEN_WORTH_A_BUTTON || isCollapsible) && (
              <li>
                <Button
                  type='button'
                  variant='tertiary'
                  className='h-10 justify-start px-0!'
                  onClick={() =>
                    setLimit(
                      isCollapsible
                        ? COOK_HISTORY_FIRST_PAGE
                        : limit + COOK_HISTORY_PAGE_SIZE,
                    )
                  }
                >
                  {isCollapsible
                    ? 'Show fewer'
                    : `Show ${Math.min(COOK_HISTORY_PAGE_SIZE, hidden)} more`}
                </Button>
              </li>
            )}
          </ul>
        )}
      </div>
    );
  };

  return (
    <FormSheet isOpen onClose={onClose} title='Cooking history'>
      {getBody()}
    </FormSheet>
  );
}

export default CookingHistorySheet;
