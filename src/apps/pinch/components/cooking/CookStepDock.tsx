import { useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, History, PenLine, Plus, Scale, Volume2 } from 'lucide-react';

import ClampedText from '@/components/ClampedText';
import { useIsShortScreen } from '@/hooks/useIsShortScreen';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import type { CookRow } from '@apps/pinch/components/cooking/CookIngredientsView';
import { CookAmountRows } from '@apps/pinch/components/cooking/CookStepAmounts';
import CookStepTray from '@apps/pinch/components/cooking/CookStepTray';
import { NOTE_KIND_EMOJIS } from '@apps/pinch/constants';
import {
  selectNoteSummaries,
  selectNotesByRecipe,
  selectNotesLoadError,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { RecipeNote } from '@apps/pinch/types';
import { getAmountsSummary } from '@apps/pinch/utils/cooks';
import {
  getLastTimeNote,
  getNoteSummary,
  leadWithAdvice,
} from '@apps/pinch/utils/notes';

type DockKind = 'TIP' | 'NOTE' | 'CHANGE';
type DockView = 'LAST' | 'AMOUNTS' | DockKind;

const KINDS: DockKind[] = ['TIP', 'NOTE', 'CHANGE'];

const KIND_WORDS: Record<DockKind, { one: string; many: string }> = {
  TIP: { one: 'tip', many: 'tips' },
  NOTE: { one: 'note', many: 'notes' },
  CHANGE: { one: 'change to make', many: 'changes to make' },
};

const ADD_LABEL = 'Add a tip, note or change for this step';

const NO_NOTES: RecipeNote[] = [];
const NO_STEPS: string[] = [];

interface IconButtonProps {
  label: string;
  isOn?: boolean;
  count?: number;
  isDashed?: boolean;
  onClick: () => void;
  children: ReactNode;
}

/** One icon in the container's header: 32px visible, 40px to hit, its count a small badge on the corner. */
function IconButton({
  label,
  isOn,
  count,
  isDashed,
  onClick,
  children,
}: IconButtonProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      aria-pressed={isOn}
      aria-label={label}
      title={label}
      className={join(
        'text-foreground! relative size-8 min-w-8 shrink-0 rounded-full px-0! py-0! text-base before:absolute before:content-[""]',
        isOn || isDashed ? 'before:-inset-[5px]' : 'before:-inset-1',
        isOn && 'bg-accent! border-primary! border',
        isDashed && 'border-muted-foreground/60 border border-dashed',
      )}
      onClick={onClick}
    >
      {children}
      {count !== undefined && (
        <span
          aria-hidden='true'
          className='bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-medium'
        >
          {count}
        </span>
      )}
    </Button>
  );
}

interface CookStepDockProps {
  rows: CookRow[];
  isAmountNoteShown: boolean;
  /** Everything written for the step on screen (the whole recipe's too on the first), tips first. */
  entries: RecipeNote[];
  /** Opens one entry to read in full and change. */
  onEdit: (id: string) => void;
  /** Opens the recipe's form to make a planned change. */
  onApplyChange: (id: string) => void;
  /** Reads one kind's entries aloud; null where the browser cannot speak. */
  onRead: ((kind: DockKind) => void) | null;
  /** Starts a new tip, note or change for this step; null where none can be written. */
  onAdd: (() => void) | null;
  /** Where the cook starts, the recipe's latest whole-recipe note leads until "Got it"; null on every later step and on a wide screen, which shows it beside the step. */
  lastTime: {
    recipeId: string;
    isDismissed: boolean;
    onGotIt: () => void;
  } | null;
  className?: string;
}

/**
 * The bottom of a step is one container, and the one place to read or add what is written for it. A row of icons at its top names what it can show (the last note, what the step uses, and each kind of thing written for it with its count) and a + that adds one; the one body under it, always the same height, shows one view. Several entries of a kind are cards that scroll sideways and snap, like the recipe's rows: a card is cut to a few lines and opens the entry to read in full. The note from last time leads on the first step until "Got it"; it stays one tap away after. A step with nothing written is just the ingredient tray and a way to add.
 */
function CookStepDock({
  rows,
  isAmountNoteShown,
  entries,
  onEdit,
  onApplyChange,
  onRead,
  onAdd,
  lastTime,
  className,
}: CookStepDockProps) {
  const recipeId = lastTime?.recipeId ?? '';
  const notes = useAppSelector(selectNotesByRecipe).get(recipeId) ?? NO_NOTES;
  const lastTweakAt =
    useAppSelector(selectNoteSummaries).get(recipeId)?.lastTweakAt ?? null;
  const isNotesReady = useAppSelector(
    (state) =>
      state.pinch.notes.isLoaded && selectNotesLoadError(state) === null,
  );
  const steps =
    useAppSelector(selectRecipesById).get(recipeId)?.steps ?? NO_STEPS;
  const isShort = useIsShortScreen();
  const [selected, setSelected] = useState<DockView | null>(null);

  const lastNote =
    lastTime !== null && isNotesReady ? getLastTimeNote(notes, steps) : null;
  if (entries.length === 0 && lastNote === null) {
    if (onAdd === null) {
      return (
        <CookStepTray
          rows={rows}
          isAmountNoteShown={isAmountNoteShown}
          className={className}
        />
      );
    }

    return (
      <div
        className={join(
          'flex items-start gap-2',
          rows.length === 0 && 'justify-end',
          className,
        )}
      >
        {rows.length > 0 ? (
          <CookStepTray
            rows={rows}
            isAmountNoteShown={isAmountNoteShown}
            className='min-w-0 flex-1'
          />
        ) : null}
        <IconButton label={ADD_LABEL} isDashed onClick={onAdd}>
          <Plus className='h-4 w-4' aria-hidden='true' />
        </IconButton>
      </div>
    );
  }

  const kinds = KINDS.filter((kind) =>
    entries.some((entry) => entry.kind === kind),
  );
  const views: DockView[] = [
    ...(lastNote === null ? [] : (['LAST'] as const)),
    ...(rows.length > 0 ? (['AMOUNTS'] as const) : []),
    ...kinds,
  ];
  const isDismissed = lastTime?.isDismissed ?? true;
  const getDefaultView = (): DockView => {
    if (lastNote !== null && !isDismissed) return 'LAST';
    return views.find((view) => view !== 'LAST') ?? 'LAST';
  };
  const defaultView = getDefaultView();
  const shown: DockView =
    selected !== null && views.includes(selected) ? selected : defaultView;
  const shownEntries = entries.filter((entry) => entry.kind === shown);
  const summary = rows.length > 0 ? getAmountsSummary(rows) : null;

  const gotIt = () => {
    lastTime?.onGotIt();
    setSelected(null);
  };

  const getBody = () => {
    if (shown === 'LAST' && lastNote !== null) {
      const body = getNoteSummary(lastNote, formatDateShort).body;
      const isChangedSince =
        lastTweakAt !== null && lastTweakAt > lastNote.createdAt;
      return (
        <div className='h-full space-y-0.5 overflow-y-auto px-2'>
          <div className='flex min-h-8 items-center justify-between gap-2'>
            <p className='text-muted-foreground text-xs font-medium'>
              Last time · {formatDateShort(lastNote.createdAt)}
            </p>
            {!isDismissed && (
              <Button
                type='button'
                variant='secondary'
                className='relative h-8 shrink-0 gap-1 rounded-full px-3 text-xs before:absolute before:-inset-1 before:content-[""]'
                aria-label='Got it, hide this note while you cook'
                onClick={gotIt}
              >
                <Check className='h-3.5 w-3.5' aria-hidden='true' />
                Got it
              </Button>
            )}
          </div>
          {isShort ? (
            <p className='line-clamp-2 text-sm wrap-break-word [@media(max-height:600px)]:line-clamp-1'>
              {leadWithAdvice(body)}
            </p>
          ) : (
            <ClampedText text={leadWithAdvice(body)} maxLines={4} />
          )}
          {isChangedSince && (
            <p className='text-muted-foreground text-xs'>
              You've changed the recipe since.
            </p>
          )}
        </div>
      );
    }
    if (shown === 'AMOUNTS' && summary) {
      return (
        <div className='h-full overflow-y-auto px-2'>
          <p className='text-muted-foreground text-xs font-medium'>
            {summary.caption}
          </p>
          {selected === 'AMOUNTS' ? (
            <>
              <CookAmountRows rows={rows} className='border-border border-t' />
              {isAmountNoteShown && (
                <p className='text-muted-foreground pt-1 text-xs'>
                  Amounts written in this step stay as they are.
                </p>
              )}
            </>
          ) : (
            <p className='line-clamp-3 text-sm wrap-break-word [@media(max-height:700px)]:line-clamp-2'>
              {summary.text}
            </p>
          )}
        </div>
      );
    }

    const isMany = shownEntries.length > 1;
    return (
      <ul
        aria-label={`Your ${shown === 'TIP' ? 'tips' : shown === 'NOTE' ? 'notes' : 'changes'} for this step`}
        className='flex h-full snap-x snap-mandatory items-start gap-2 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
      >
        {shownEntries.map((entry) => {
          const isChange = entry.kind === 'CHANGE';
          const kindWord =
            entry.kind === 'TIP'
              ? 'tip'
              : entry.kind === 'CHANGE'
                ? 'change'
                : 'note';
          return (
            <li
              key={entry.id}
              className={join(
                'bg-background/70 border-border flex shrink-0 snap-start items-stretch rounded-xl border',
                isMany ? 'w-[88%]' : 'w-full self-start',
              )}
            >
              <Button
                type='button'
                variant='tertiary'
                aria-label={`Open your ${kindWord}: ${entry.text ?? ''}`}
                className='text-foreground! h-auto min-w-0 flex-1 flex-col items-start justify-start gap-0.5 rounded-xl px-3 py-2 text-left font-normal whitespace-normal'
                onClick={() => onEdit(entry.id)}
              >
                <span
                  className={join(
                    'w-full text-sm wrap-break-word',
                    isChange || isShort ? 'line-clamp-2' : 'line-clamp-3',
                  )}
                >
                  <span aria-hidden='true'>{NOTE_KIND_EMOJIS[entry.kind]} </span>
                  {entry.text}
                </span>
                {isChange && (entry.reason ?? '') !== '' && (
                  <span className='text-muted-foreground line-clamp-1 w-full text-xs'>
                    Why: {entry.reason}
                  </span>
                )}
              </Button>
              {isChange && (
                <div className='flex items-start pt-1.5 pr-1.5'>
                  <IconButton
                    label='Update the recipe with this change'
                    onClick={() => onApplyChange(entry.id)}
                  >
                    <PenLine className='h-4 w-4' aria-hidden='true' />
                  </IconButton>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <section
      aria-label='Written and used in this step'
      className={join(
        'bg-muted/50 border-border space-y-1 rounded-2xl border p-2',
        className,
      )}
    >
      <div className='flex min-h-10 items-center justify-between gap-1'>
        <div role='group' aria-label='What to show' className='flex gap-1'>
          {views.includes('LAST') && (
            <IconButton
              label='The note from last time'
              isOn={shown === 'LAST'}
              onClick={() => setSelected('LAST')}
            >
              <History className='h-4 w-4' aria-hidden='true' />
            </IconButton>
          )}
          {views.includes('AMOUNTS') && (
            <IconButton
              label='Amounts for this step'
              isOn={shown === 'AMOUNTS'}
              onClick={() => setSelected('AMOUNTS')}
            >
              <Scale className='h-4 w-4' aria-hidden='true' />
            </IconButton>
          )}
          {kinds.map((kind) => {
            const count = entries.filter((entry) => entry.kind === kind).length;
            const words = KIND_WORDS[kind];
            return (
              <IconButton
                key={kind}
                label={`${count} ${count === 1 ? words.one : words.many}`}
                isOn={shown === kind}
                count={count}
                onClick={() => setSelected(kind)}
              >
                <span aria-hidden='true'>{NOTE_KIND_EMOJIS[kind]}</span>
              </IconButton>
            );
          })}
        </div>
        <div className='flex shrink-0 gap-1'>
          {shown !== 'LAST' && shown !== 'AMOUNTS' && onRead && (
            <IconButton
              label={`Read the ${KIND_WORDS[shown].many.split(' ')[0]} aloud`}
              onClick={() => onRead(shown)}
            >
              <Volume2 className='h-4 w-4' aria-hidden='true' />
            </IconButton>
          )}
          {onAdd && (
            <IconButton label={ADD_LABEL} isDashed onClick={onAdd}>
              <Plus className='h-4 w-4' aria-hidden='true' />
            </IconButton>
          )}
        </div>
      </div>
      <div className='h-28 [@media(max-height:700px)]:h-20 [@media(max-height:600px)]:h-16!'>
        {getBody()}
      </div>
    </section>
  );
}

export default CookStepDock;
