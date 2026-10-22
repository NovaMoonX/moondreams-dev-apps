import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, PenLine, Plus } from 'lucide-react';

import ActionChips, { type ActionChip } from '@/components/ActionChips';
import TickMark from '@/components/TickMark';
import { useIsShortScreen } from '@/hooks/useIsShortScreen';
import { NOTE_KIND_EMOJIS } from '@apps/pinch/constants';
import type { RecipeNote } from '@apps/pinch/types';

const CARD_CLASS = 'bg-muted/50 border-border w-full rounded-2xl border';

export interface CookReviewEntry {
  note: RecipeNote;
  /** The step (0-based) it is about in the recipe as it is now, or null for the whole recipe. */
  stepAt: number | null;
}

interface CookReviewProps {
  /** The recipe's name over the card when the screen cooks several. */
  caption: string | null;
  /** What was written for this recipe during the cook, oldest first. */
  entries: CookReviewEntry[];
  /** Writing needs the notes to have loaded and room in the journal. */
  canAdd: boolean;
  /** "Nothing to add" stays marked once tapped; it writes nothing. */
  isNothingChosen: boolean;
  /** What the panel did for the recipe ("Recipe changed."), or null while nothing has. */
  doneText: string | null;
  /** How many of the changes written in this cook are still planned. */
  plannedChangeCount: number;
  onAdd: () => void;
  onEdit: (id: string) => void;
  /** Opens the recipe's form with those planned changes. */
  onApplyChanges: () => void;
  /** Opens the recipe's form with nothing planned. */
  onChangeRecipe: () => void;
  onNothing: () => void;
}

/** The last panel's one question about the cook: what the person wrote while cooking, to read over, change or add to, and the ways to change the recipe now. Applying planned changes turns each into the record of the edit; nothing here writes a second entry for the same change. */
function CookReview({
  caption,
  entries,
  canAdd,
  isNothingChosen,
  doneText,
  plannedChangeCount,
  onAdd,
  onEdit,
  onApplyChanges,
  onChangeRecipe,
  onNothing,
}: CookReviewProps) {
  const isShort = useIsShortScreen();
  const hasEntries = entries.length > 0;
  const actions: ActionChip[] = [
    ...(plannedChangeCount > 0
      ? [
          {
            key: 'apply',
            icon: <PenLine className='h-4 w-4' />,
            label:
              plannedChangeCount === 1
                ? 'Update the recipe with your change'
                : `Update the recipe with your ${plannedChangeCount} changes`,
            onClick: onApplyChanges,
          },
        ]
      : []),
    ...(canAdd
      ? [
          {
            key: 'add',
            icon: <Plus className='h-4 w-4' />,
            label: hasEntries ? 'Add another' : 'Add a tip, note or change',
            description: 'Add a tip, note or change',
            onClick: onAdd,
          },
        ]
      : []),
    ...(plannedChangeCount === 0
      ? [
          {
            key: 'change',
            icon: <PenLine className='h-4 w-4' />,
            label: 'Change the recipe',
            onClick: onChangeRecipe,
          },
        ]
      : []),
    ...(!hasEntries && doneText === null && !isNothingChosen
      ? [
          {
            key: 'nothing',
            icon: <TickMark variant='soft' />,
            label: 'Nothing to add',
            isQuiet: true,
            onClick: onNothing,
          },
        ]
      : []),
  ];

  return (
    <section
      aria-label={
        caption
          ? `${caption}: Anything to remember or change?`
          : 'Anything to remember or change?'
      }
      className={join(CARD_CLASS, 'space-y-3 px-4 py-4')}
    >
      <div className={join(!isShort && 'text-center')}>
        {caption && (
          <p className='text-muted-foreground text-xs wrap-break-word'>
            {caption}
          </p>
        )}
        <p className={join('font-medium', isShort && 'text-sm')}>
          Anything to remember or change?
        </p>
      </div>
      {hasEntries && (
        <ul
          aria-label='What you wrote while cooking'
          className='divide-border border-border bg-background/60 divide-y rounded-xl border'
        >
          {entries.map(({ note, stepAt }) => (
            <li key={note.id}>
              <Button
                type='button'
                variant='tertiary'
                className='text-foreground! h-auto min-h-12 w-full justify-start gap-2 px-3! py-2 text-left font-normal whitespace-normal'
                aria-label={`Change your ${note.kind === 'CHANGE' ? 'change' : note.kind === 'TIP' ? 'tip' : 'note'}: ${note.text ?? ''}`}
                onClick={() => onEdit(note.id)}
              >
                <span aria-hidden='true' className='w-5 shrink-0 text-center'>
                  {NOTE_KIND_EMOJIS[note.kind]}
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='line-clamp-2 text-sm wrap-break-word'>
                    {note.text}
                  </span>
                  <span className='text-muted-foreground block text-xs'>
                    {stepAt === null ? 'Whole recipe' : `Step ${stepAt + 1}`}
                    {note.kind === 'CHANGE' && (note.reason ?? '') !== ''
                      ? ` · ${note.reason}`
                      : ''}
                  </span>
                </span>
                <ChevronRight
                  className='text-muted-foreground h-4 w-4 shrink-0'
                  aria-hidden='true'
                />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {doneText !== null && (
        <p role='status' className='flex items-center gap-3 text-sm'>
          <TickMark />
          <span className='min-w-0 flex-1 font-medium text-balance'>
            {doneText}
          </span>
        </p>
      )}
      {isNothingChosen && !hasEntries && doneText === null && (
        <p role='status' className='text-muted-foreground text-center text-sm'>
          Nothing to add.
        </p>
      )}
      <ActionChips
        label="What you'd like to do"
        className={join(!isShort && 'justify-center')}
        actions={actions}
      />
    </section>
  );
}

export default CookReview;
