import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Plus } from 'lucide-react';

import FormSection from '@/components/FormSection';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import type { WrittenNoteKind } from '@apps/pinch/components/notes/NoteKindPills';
import { NOTE_KIND_EMOJIS, SOFT_MAX_RECIPE_NOTES } from '@apps/pinch/constants';
import {
  selectNotesByRecipe,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { RecipeNote } from '@apps/pinch/types';
import {
  isDoneChange,
  isOpenChange,
  resolveNoteStep,
} from '@apps/pinch/utils/notes';

const NO_NOTES: RecipeNote[] = [];
const NO_STEPS: string[] = [];

type EntryKind = 'TIP' | 'NOTE' | 'CHANGE';

const KIND_TEXT: Record<
  EntryKind,
  { title: string; one: string; add: string }
> = {
  TIP: { title: 'Tips', one: 'Tip', add: 'Add a tip' },
  NOTE: { title: 'Notes', one: 'Note', add: 'Add a note' },
  CHANGE: {
    title: 'Planned changes',
    one: 'Planned change',
    add: 'Plan a change',
  },
};

interface RecipeEntryRowsProps {
  recipeId: string;
  /** Opens one entry to read and edit, or a new one of the kind when the id is null. */
  onOpen: (noteId: string | null, kind: WrittenNoteKind | null) => void;
}

/**
 * The person's own tips, notes and open planned changes at the foot of the recipe, each kind its own row of cards that scrolls sideways and snaps to a card, the last card adding another. A tip is advice for the dish; a note is about a cook, so it is dated; a planned change is something to do to the recipe, and leaves here once it is done, unless it was handled with no edit and no cook. The records of edits are not here: they live behind the clock.
 */
function RecipeEntryRows({ recipeId, onOpen }: RecipeEntryRowsProps) {
  const notes = useAppSelector(selectNotesByRecipe).get(recipeId) ?? NO_NOTES;
  const steps =
    useAppSelector(selectRecipesById).get(recipeId)?.steps ?? NO_STEPS;
  const isLoaded = useAppSelector((state) => state.pinch.notes.isLoaded);
  const loadError = useAppSelector((state) => state.pinch.notes.loadError);

  if (loadError !== null || !isLoaded) return null;

  const canAdd = notes.length < SOFT_MAX_RECIPE_NOTES;
  const getEntries = (kind: EntryKind) =>
    notes
      .filter(
        (note) =>
          (kind === 'CHANGE' ? isOpenChange(note) : note.kind === kind) &&
          (note.text ?? '') !== '',
      )
      .map((note) => ({ note, step: resolveNoteStep(note, steps) }))
      .sort((a, b) =>
        kind !== 'NOTE'
          ? (a.step ?? -1) - (b.step ?? -1) ||
            a.note.createdAt - b.note.createdAt
          : b.note.createdAt - a.note.createdAt,
      );
  const tips = getEntries('TIP');
  const written = getEntries('NOTE');
  // A change handled with no edit and no cook is shown nowhere else, so it stays here, after the open ones.
  const handled = notes
    .filter(
      (note) =>
        isDoneChange(note) &&
        note.cookId == null &&
        (note.resolvedBy ?? null) === null &&
        (note.text ?? '') !== '',
    )
    .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))
    .map((note) => ({ note, step: resolveNoteStep(note, steps) }));
  const changes = [...getEntries('CHANGE'), ...handled];

  const getSlimAdd = (label: string, kind: WrittenNoteKind | null) =>
    canAdd && (
      <Button
        type='button'
        variant='tertiary'
        className='border-border text-foreground! h-12 w-full justify-start gap-2 rounded-2xl border border-dashed px-4 font-normal'
        onClick={() => onOpen(null, kind)}
      >
        <Plus className='h-4 w-4' aria-hidden='true' />
        {label}
      </Button>
    );

  if (tips.length === 0 && written.length === 0 && changes.length === 0) {
    return canAdd ? (
      <FormSection title='Tips, notes and changes'>
        {getSlimAdd('Add a tip, note or change', null)}
      </FormSection>
    ) : null;
  }

  const getRow = (
    kind: EntryKind,
    entries: { note: RecipeNote; step: number | null }[],
  ) => {
    const text = KIND_TEXT[kind];
    if (entries.length === 0) {
      if (kind === 'CHANGE') return null;
      return (
        <FormSection key={kind} title={text.title}>
          {getSlimAdd(text.add, kind)}
        </FormSection>
      );
    }

    return (
      <FormSection key={kind} title={text.title}>
        <ul
          aria-label={`Your ${text.title.toLowerCase()}`}
          className='-mx-1 flex snap-x snap-mandatory scroll-px-1 [scrollbar-width:none] items-stretch gap-3 overflow-x-auto px-1 pb-1 [&::-webkit-scrollbar]:hidden'
        >
          {entries.map(({ note, step }) => {
            const isChange = kind === 'CHANGE';
            const place =
              step === null
                ? isChange
                  ? 'Whole recipe'
                  : ''
                : `Step ${step + 1}`;
            const where = isDoneChange(note) ? `${place} · Done` : place;
            const when = kind === 'NOTE' ? formatDateShort(note.createdAt) : '';
            return (
              <li
                key={note.id}
                className='bg-muted/50 border-border flex w-[80%] shrink-0 snap-start rounded-2xl border sm:w-72'
              >
                <Button
                  type='button'
                  variant='tertiary'
                  aria-label={[text.one, where, when, note.text]
                    .filter(Boolean)
                    .join(', ')}
                  className='text-foreground! h-auto w-full flex-col items-start justify-start gap-1.5 rounded-2xl px-3 py-3 text-left font-normal whitespace-normal'
                  onClick={() => onOpen(note.id, isChange ? 'CHANGE' : null)}
                >
                  {(where !== '' || when !== '') && (
                    <span className='text-muted-foreground flex w-full items-center gap-1.5 text-xs'>
                      <span aria-hidden='true'>{NOTE_KIND_EMOJIS[kind]}</span>
                      {where !== '' && <span>{where}</span>}
                      {when !== '' && <span>{when}</span>}
                    </span>
                  )}
                  <span className='line-clamp-4 w-full text-sm wrap-break-word'>
                    {note.text}
                  </span>
                  {isChange && (note.reason ?? '') !== '' && (
                    <span className='text-muted-foreground line-clamp-2 w-full text-xs wrap-break-word'>
                      Why: {note.reason}
                    </span>
                  )}
                </Button>
              </li>
            );
          })}
          {canAdd && (
            <li className='flex w-[56%] shrink-0 snap-start sm:w-44'>
              <Button
                type='button'
                variant='tertiary'
                className='border-border text-foreground! h-auto min-h-24 w-full flex-col justify-center gap-1 rounded-2xl border border-dashed px-3 font-normal whitespace-normal'
                onClick={() => onOpen(null, kind)}
              >
                <Plus className='h-4 w-4' aria-hidden='true' />
                <span className='text-sm'>{text.add}</span>
              </Button>
            </li>
          )}
        </ul>
      </FormSection>
    );
  };

  return (
    <>
      {getRow('TIP', tips)}
      {getRow('NOTE', written)}
      {getRow('CHANGE', changes)}
    </>
  );
}

export default RecipeEntryRows;
