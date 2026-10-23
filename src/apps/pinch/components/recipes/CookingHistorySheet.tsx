import { useMemo, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight, NotebookPen, Plus } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import { PillGroup } from '@/components/PillGroup';
import ShowMoreButton from '@/components/ShowMoreButton';
import StarRating from '@/components/StarRating';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShort } from '@/utils/formatUtils';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import NoteEntry from '@apps/pinch/components/notes/NoteEntry';
import NoteForm from '@apps/pinch/components/notes/NoteForm';
import CookEditView from '@apps/pinch/components/recipes/CookEditView';
import CookJournal from '@apps/pinch/components/recipes/CookJournal';
import CookPhotoThumb from '@apps/pinch/components/shared/CookPhotoThumb';
import {
  COOK_HISTORY_FIRST_PAGE,
  COOK_HISTORY_PAGE_SIZE,
  SOFT_MAX_COOKS_PER_RECIPE,
} from '@apps/pinch/constants';
import { CONTAINER_EMOJI } from '@apps/pinch/constants';
import { scopedContainersQueryOptions } from '@apps/pinch/queries/containerQueries';
import {
  selectContainersByCookId,
  selectCookSummaries,
  selectCooksByRecipe,
  selectNotesByRecipe,
  selectNotesLoadError,
  selectPlannedMeals,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import { undoRecipeChange } from '@apps/pinch/store/actions/recipeActions';
import type { Container, Cook, RecipeNote } from '@apps/pinch/types';
import {
  getPutAwayText,
  groupContainersByCook,
} from '@apps/pinch/utils/containers';
import {
  formatCookRating,
  getCookServings,
  getRatingAverage,
  isCookHistoryFull,
} from '@apps/pinch/utils/cooks';
import { formatDayTitle, getPlannedDayKey } from '@apps/pinch/utils/dayKeys';
import { getUndoableTweakIds } from '@apps/pinch/utils/notes';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

const NO_COOKS: Cook[] = [];
const NO_NOTES: RecipeNote[] = [];
const NO_IDS: string[] = [];
const CHANGES_FIRST_SHOWN = 4;
const UNDO_LINES_SHOWN = 3;

/** What was written for a cook, in a few words: "A note", "A note and 2 changes". */
const getWrittenLine = (kinds: string[] | undefined) => {
  if (kinds === undefined) return null;
  const count = (wanted: string[]) =>
    kinds.filter((kind) => wanted.includes(kind)).length;
  const notes = count(['NOTE']);
  const changes = count(['CHANGE', 'TWEAK']);
  const parts = [
    ...(notes === 0 ? [] : [notes === 1 ? 'a note' : `${notes} notes`]),
    ...(changes === 0
      ? []
      : [changes === 1 ? 'a change' : `${changes} changes`]),
  ];
  const line = parts.join(' and ');
  return line === '' ? null : `${line[0].toUpperCase()}${line.slice(1)}`;
};
const HIDDEN_WORTH_A_BUTTON = 3;
/** Photos drawn at once: the grid is the latest ones, and every cook with a photo is also a row of All cooks. */
const PHOTOS_SHOWN = 30;

type HistoryView =
  | { kind: 'list' }
  | { kind: 'edit'; cookId: string | null; token: number }
  | { kind: 'note'; cookId: string; noteId: string | null; token: number };

interface CookingHistorySheetProps {
  uid: string;
  recipeId: string;
  onClose: () => void;
  /** Leaves the sheet for the recipe's form without returning to the screen's drawer; closing does that. Falls back to `onClose`. */
  onLeaveForForm?: () => void;
}

function CookingHistorySheet({
  uid,
  recipeId,
  onClose,
  onLeaveForForm = onClose,
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
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const notedCookIds = useMemo(
    () =>
      new Set(
        (notes ?? [])
          .filter((entry) => entry.kind === 'NOTE')
          .map((entry) => entry.cookId ?? null),
      ),
    [notes],
  );
  const writtenByCook = useMemo(
    () =>
      (notes ?? []).reduce(
        (counts, entry) =>
          entry.cookId == null || entry.kind === 'TIP'
            ? counts
            : counts.set(entry.cookId, [
                ...(counts.get(entry.cookId) ?? []),
                entry.kind,
              ]),
        new Map<string, string[]>(),
      ),
    [notes],
  );
  const tweaks = useMemo(
    () => (notes ?? NO_NOTES).filter((entry) => entry.kind === 'TWEAK'),
    [notes],
  );
  const undoableIds = useMemo(
    () => (recipe ? getUndoableTweakIds(tweaks, recipe.updatedAt) : NO_IDS),
    [tweaks, recipe],
  );
  const summary = useAppSelector(selectCookSummaries).get(recipeId);
  const { openSubview } = usePinchOverlay();
  const [mode, setMode] = useState<'cooks' | 'photos' | 'changes'>('cooks');
  const [changesLimit, setChangesLimit] = useState(CHANGES_FIRST_SHOWN);
  const [undoError, setUndoError] = useState<string | null>(null);
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
  const openNote = (cookId: string, noteId: string | null = null) =>
    openView((token) => ({ kind: 'note', cookId, noteId, token }));
  const closeView = (token: number) =>
    setView((current) =>
      current.kind !== 'list' && current.token === token
        ? { kind: 'list' }
        : current,
    );

  const askUndo = async () => {
    const undone = tweaks.filter((entry) => undoableIds.includes(entry.id));
    if (undone.length === 0) return;
    const lines = undone.flatMap((entry) => entry.changes ?? []);
    const day = formatDateShort(undone[0].createdAt);
    const confirmed = await confirm({
      title: 'Put the recipe back?',
      message: `${recipe?.title ?? 'The recipe'} goes back to how it was before ${day}, which takes back: ${lines.slice(0, UNDO_LINES_SHOWN).join('; ')}${lines.length > UNDO_LINES_SHOWN ? `; and ${lines.length - UNDO_LINES_SHOWN} more` : ''}. Its photo, keeping times, links and collections stay as they are, this record of the change is removed, and a change you had planned is not planned again.`,
      confirmText: 'Put it back',
      destructive: true,
    });
    if (!confirmed) return;

    setUndoError(null);
    try {
      await dispatch(
        undoRecipeChange({
          uid,
          recipeId,
          noteIds: undone.map((entry) => entry.id),
        }),
      ).unwrap();
      addToast({
        title: `Put the recipe back to how it was before ${day}`,
        type: 'success',
      });
    } catch (error) {
      setUndoError(getErrorMessage(error, 'Unable to undo this change.'));
    }
  };

  const hidden = cooks.length - limit;
  const visibleCount = hidden > HIDDEN_WORTH_A_BUTTON ? limit : cooks.length;
  const isCollapsible =
    visibleCount === cooks.length &&
    cooks.length > COOK_HISTORY_FIRST_PAGE + HIDDEN_WORTH_A_BUTTON;

  const average = summary === undefined ? null : getRatingAverage(summary);
  const photoCount = summary?.photoCount ?? 0;
  const resultsLine =
    average === null && photoCount === 0
      ? null
      : [
          average === null
            ? null
            : `★ ${formatCookRating(average)} average from ${summary?.ratedCount ?? 0} ${summary?.ratedCount === 1 ? 'rating' : 'ratings'}`,
          photoCount === 0
            ? null
            : `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}`,
        ]
          .filter((part) => part !== null)
          .join(' · ');
  const photoCooks = cooks.filter((cook) => cook.photoPath != null);
  const shownMode =
    (mode === 'photos' && photoCount > 0) ||
    (mode === 'changes' && tweaks.length > 0)
      ? mode
      : 'cooks';
  const modeOptions = [
    { value: 'cooks' as const, label: 'All cooks' },
    ...(photoCount > 0
      ? [{ value: 'photos' as const, label: `Photos · ${photoCount}` }]
      : []),
    ...(tweaks.length > 0
      ? [{ value: 'changes' as const, label: `Changes · ${tweaks.length}` }]
      : []),
  ];
  const changesHidden = tweaks.length - changesLimit;
  const shownChanges =
    changesHidden > 1 ? tweaks.slice(0, changesLimit) : tweaks;

  const getBody = () => {
    if (view.kind === 'note') {
      const noteView = view;
      const noteCook = cooks.find((cook) => cook.id === noteView.cookId);
      const closeNote = () => closeView(noteView.token);
      return (
        <div className='space-y-4'>
          <BackLink onBack={closeNote} />
          <div className='space-y-0.5'>
            <p className='font-medium wrap-break-word'>
              {recipe?.title ?? 'This recipe'}
            </p>
            <p className='text-muted-foreground text-sm'>
              {noteCook ? (
                <>
                  What you wrote about the cook from{' '}
                  <span className='whitespace-nowrap'>
                    {formatDateShort(noteCook.cookedAt)}
                  </span>
                </>
              ) : (
                'What you wrote about a cook'
              )}
            </p>
          </div>
          <NoteForm
            key={noteView.token}
            uid={uid}
            recipeId={recipeId}
            noteId={noteView.noteId}
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
          journal={
            editedCook && writtenByCook.has(editedCook.id) ? (
              <CookJournal
                recipeId={recipeId}
                cookId={editedCook.id}
                onEdit={(noteId) => openNote(editedCook.id, noteId)}
                onApplyChange={(noteId) => {
                  onLeaveForForm();
                  openSubview({
                    kind: 'recipe',
                    id: recipeId,
                    fromChangeIds: [noteId],
                  });
                }}
                undoableIds={undoableIds}
                onUndo={() => void askUndo()}
                undoError={undoError}
              />
            ) : null
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
          {shownMode === 'changes' ? null : isFull ? (
            <p className='text-muted-foreground text-sm'>
              A recipe's history holds up to {SOFT_MAX_COOKS_PER_RECIPE} cooks.
              Delete an older one to add more.
            </p>
          ) : (
            <ActionRow
              icon={<Plus className='h-4 w-4' />}
              label='Add an earlier cook'
              onClick={() => openEdit(null)}
            />
          )}
          {resultsLine !== null && (
            <p className='text-muted-foreground text-sm'>{resultsLine}</p>
          )}
          {modeOptions.length > 1 && (
            <PillGroup
              label='How to look over your cooks'
              isThin
              value={shownMode}
              onChange={setMode}
              options={modeOptions}
            />
          )}
        </div>
        {shownMode === 'changes' ? (
          <div className='min-h-0 flex-1 overflow-y-auto'>
            {undoError && (
              <p className='text-destructive pt-2 text-sm'>{undoError}</p>
            )}
            <ul className='divide-border divide-y'>
              {shownChanges.map((entry) => (
                <NoteEntry
                  key={entry.id}
                  note={entry}
                  cook={null}
                  writtenBefore={null}
                  stepAt={null}
                  isStepLost={false}
                  onEdit={null}
                  onApplyChange={null}
                  onUndo={
                    undoableIds.includes(entry.id) ? () => void askUndo() : null
                  }
                />
              ))}
            </ul>
            {changesHidden > 1 && (
              <ShowMoreButton
                isOpen={false}
                onClick={() =>
                  setChangesLimit(changesLimit + CHANGES_FIRST_SHOWN)
                }
              >
                Show {Math.min(CHANGES_FIRST_SHOWN, changesHidden)} more
              </ShowMoreButton>
            )}
          </div>
        ) : cooks.length === 0 ? (
          <p className='text-muted-foreground py-4 text-center text-sm'>
            No cooks yet. Add the ones you remember.
          </p>
        ) : shownMode === 'photos' ? (
          <ul className='grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto pt-2 sm:grid-cols-3'>
            {photoCooks.slice(0, PHOTOS_SHOWN).map((cook) => {
              const day = formatDateShort(cook.cookedAt);
              return (
                <li key={cook.id}>
                  <Button
                    type='button'
                    variant='tertiary'
                    aria-label={`The cook from ${day}${cook.rating == null ? '' : `, rated ${formatCookRating(cook.rating)}`}`}
                    className='h-auto w-full flex-col items-stretch gap-1.5 px-0! py-0 text-left font-normal'
                    onClick={() => openEdit(cook.id)}
                  >
                    <CookPhotoThumb
                      cook={cook}
                      className='aspect-square w-full rounded-2xl'
                    />
                    <span className='flex flex-wrap items-center gap-x-2 text-xs'>
                      <span className='text-foreground whitespace-nowrap'>
                        {day}
                      </span>
                      {cook.rating != null && (
                        <StarRating value={cook.rating} />
                      )}
                    </span>
                  </Button>
                </li>
              );
            })}
            {photoCooks.length > PHOTOS_SHOWN && (
              <li className='col-span-full text-muted-foreground text-xs'>
                The latest {PHOTOS_SHOWN} are here; the rest are in All cooks.
              </li>
            )}
          </ul>
        ) : (
          <ul className='divide-border min-h-0 flex-1 divide-y overflow-y-auto'>
            {cooks.slice(0, visibleCount).map((cook) => {
              const planNote = getPlanNote(cook);
              const putAway = putAwayByCook.get(cook.id) ?? null;
              const day = formatDateShort(cook.cookedAt);
              const writtenLine = getWrittenLine(writtenByCook.get(cook.id));
              return (
                <li key={cook.id} className='pb-2'>
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
                      {cook.rating != null && (
                        <span className='block pt-0.5'>
                          <StarRating value={cook.rating} />
                        </span>
                      )}
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
                      {writtenLine !== null && (
                        <span className='text-muted-foreground block text-xs font-normal wrap-break-word'>
                          {writtenLine}
                        </span>
                      )}
                    </span>
                    <CookPhotoThumb cook={cook} className='size-12' />
                    <ChevronRight
                      className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
                      aria-hidden='true'
                    />
                  </Button>
                  {isNotesReady && !notedCookIds.has(cook.id) && (
                    <ActionChips
                      className='pb-1'
                      actions={[
                        {
                          key: 'note',
                          icon: <NotebookPen className='h-4 w-4' />,
                          label: 'Add a note',
                          description: `Add a note about the cook from ${day}`,
                          onClick: () => openNote(cook.id),
                        },
                      ]}
                    />
                  )}
                </li>
              );
            })}
            {(hidden > HIDDEN_WORTH_A_BUTTON || isCollapsible) && (
              <li>
                <ShowMoreButton
                  isOpen={isCollapsible}
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
                </ShowMoreButton>
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
