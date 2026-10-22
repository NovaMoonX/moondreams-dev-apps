import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, History, PenLine, Plus, Scale, Volume2, X } from 'lucide-react';

import { useBackStep } from '@/hooks/useBackHistory';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import type { CookRow } from '@apps/pinch/components/cooking/CookIngredientsView';
import { CookAmountRows } from '@apps/pinch/components/cooking/CookStepAmounts';
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

export type DockKind = 'TIP' | 'NOTE' | 'CHANGE';
export type DockView = 'LAST' | 'AMOUNTS' | DockKind;

const KINDS: DockKind[] = ['TIP', 'NOTE', 'CHANGE'];

const KIND_WORDS: Record<DockKind, { one: string; many: string }> = {
  TIP: { one: 'tip', many: 'tips' },
  NOTE: { one: 'note', many: 'notes' },
  CHANGE: { one: 'change to make', many: 'changes to make' },
};

const ADD_LABEL = 'Add a tip, note or change for this step';

const NO_NOTES: RecipeNote[] = [];
const NO_STEPS: string[] = [];

interface BubbleProps {
  label: string;
  isOn?: boolean;
  isNudged?: boolean;
  count?: number;
  isDashed?: boolean;
  isInline?: boolean;
  controls?: string;
  onClick: () => void;
  children: ReactNode;
}

/** A round button: 36px to see (32px inside the panel), 40px to hit, its count a small badge on the corner. */
function Bubble({
  label,
  isOn,
  isNudged,
  count,
  isDashed,
  isInline,
  controls,
  onClick,
  children,
}: BubbleProps) {
  const isBordered = isOn || isDashed || isNudged;
  return (
    <Button
      type='button'
      variant='tertiary'
      aria-pressed={isOn}
      aria-expanded={controls === undefined ? undefined : isOn}
      aria-controls={controls}
      aria-label={label}
      title={label}
      className={join(
        'text-foreground! relative shrink-0 rounded-full px-0! py-0! text-base before:absolute before:content-[""]',
        isInline ? 'size-8 min-w-8' : 'size-9 min-w-9',
        isBordered ? 'before:-inset-[3px]' : 'before:-inset-0.5',
        isOn && 'bg-accent! border-primary! border',
        isNudged && !isOn && 'bg-accent! border-border border',
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
  /** Where the cook starts, the recipe's latest whole-recipe note waits behind its bubble until "Got it"; null on every later step and on a wide screen, which shows it beside the step. */
  lastTime: {
    recipeId: string;
    isDismissed: boolean;
    onGotIt: () => void;
  } | null;
  /** Which view is open above the bubbles; the screen holds it so a spoken "show me the tips" opens the same one. */
  shown: DockView | null;
  onShow: (view: DockView | null) => void;
  className?: string;
}

/**
 * The foot of a step is a row of round buttons on the right (what the step uses, the note from last time, and each kind of thing written for it with its count) and a dashed + that writes a new one. Nothing else is drawn until one is tapped: its view opens above the row, over the step, with a close and, for tips, notes and changes, a speaker; tapping the same button, the ✕, Escape or the back gesture closes it. Several entries of a kind are cards that scroll sideways and snap, like the recipe's rows, each cut to a few lines and opening the entry to read in full.
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
  shown,
  onShow,
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

  const lastNote =
    lastTime !== null && isNotesReady ? getLastTimeNote(notes, steps) : null;
  const kinds = KINDS.filter((kind) =>
    entries.some((entry) => entry.kind === kind),
  );
  const views: DockView[] = [
    ...(lastNote === null ? [] : (['LAST'] as const)),
    ...(rows.length > 0 ? (['AMOUNTS'] as const) : []),
    ...kinds,
  ];
  const open: DockView | null =
    shown !== null && views.includes(shown) ? shown : null;
  const close = () => onShow(null);
  useBackStep(open !== null, close);

  if (views.length === 0 && onAdd === null) return null;

  const isDismissed = lastTime?.isDismissed ?? true;
  const summary = rows.length > 0 ? getAmountsSummary(rows) : null;
  const openKind: DockKind | null =
    open === 'TIP' || open === 'NOTE' || open === 'CHANGE' ? open : null;
  const openEntries =
    openKind === null ? [] : entries.filter((entry) => entry.kind === openKind);
  const toggle = (view: DockView) => onShow(open === view ? null : view);
  const panelId = 'cook-step-panel';

  const getTitle = () => {
    if (open === 'LAST' && lastNote !== null) {
      return `Last time · ${formatDateShort(lastNote.createdAt)}`;
    }
    if (open === 'AMOUNTS') return summary?.caption ?? 'This step';
    if (openKind === null) return '';
    const words = KIND_WORDS[openKind];
    return `${openEntries.length} ${openEntries.length === 1 ? words.one : words.many}`;
  };

  const getBody = () => {
    if (open === 'LAST' && lastNote !== null) {
      const body = getNoteSummary(lastNote, formatDateShort).body;
      const isChangedSince =
        lastTweakAt !== null && lastTweakAt > lastNote.createdAt;
      return (
        <div className='space-y-1 px-1'>
          <p className='text-sm wrap-break-word whitespace-pre-wrap'>
            {leadWithAdvice(body)}
          </p>
          {isChangedSince && (
            <p className='text-muted-foreground text-xs'>
              You've changed the recipe since.
            </p>
          )}
        </div>
      );
    }
    if (open === 'AMOUNTS' && summary) {
      return (
        <div className='px-1'>
          <CookAmountRows rows={rows} className='border-border border-t' />
          {isAmountNoteShown && (
            <p className='text-muted-foreground pt-1 text-xs'>
              Amounts written in this step stay as they are.
            </p>
          )}
        </div>
      );
    }
    if (openKind === null) return null;

    const isMany = openEntries.length > 1;
    return (
      <ul
        data-no-swipe=''
        aria-label={`Your ${KIND_WORDS[openKind].many} for this step`}
        className='flex snap-x snap-mandatory items-start gap-2 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
      >
        {openEntries.map((entry) => {
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
                isMany ? 'w-[88%]' : 'w-full',
              )}
            >
              <Button
                type='button'
                variant='tertiary'
                aria-label={`Open your ${kindWord}: ${entry.text ?? ''}`}
                className='text-foreground! h-auto min-w-0 flex-1 flex-col items-start justify-start gap-0.5 rounded-xl px-3 py-2 text-left font-normal whitespace-normal'
                onClick={() => onEdit(entry.id)}
              >
                <span className='line-clamp-3 w-full text-sm wrap-break-word'>
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
                  <Bubble
                    isInline
                    label='Update the recipe with this change'
                    onClick={() => onApplyChange(entry.id)}
                  >
                    <PenLine className='h-4 w-4' aria-hidden='true' />
                  </Bubble>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className={join('relative', className)}>
      {open !== null && (
        <section
          id={panelId}
          aria-label={getTitle()}
          data-no-swipe=''
          className='bg-popover text-popover-foreground border-border absolute inset-x-0 bottom-full z-20 mb-2 space-y-1 rounded-2xl border p-2 shadow-lg [@media(max-height:500px)_and_(min-width:640px)]:top-full [@media(max-height:500px)_and_(min-width:640px)]:bottom-auto [@media(max-height:500px)_and_(min-width:640px)]:mt-2 [@media(max-height:500px)_and_(min-width:640px)]:mb-0'
        >
          <div className='flex min-h-8 items-center justify-between gap-2 px-1'>
            <p className='text-muted-foreground min-w-0 flex-1 truncate text-xs font-medium'>
              {getTitle()}
            </p>
            <div className='flex shrink-0 items-center gap-2'>
              {open === 'LAST' && !isDismissed && (
                <Button
                  type='button'
                  variant='secondary'
                  className='relative h-8 shrink-0 gap-1 rounded-full px-3 text-xs before:absolute before:-inset-1 before:content-[""]'
                  aria-label='Got it, put this note away while you cook'
                  onClick={() => {
                    lastTime?.onGotIt();
                    close();
                  }}
                >
                  <Check className='h-3.5 w-3.5' aria-hidden='true' />
                  Got it
                </Button>
              )}
              {openKind !== null && onRead && (
                  <Bubble
                    isInline
                    label={`Read the ${KIND_WORDS[openKind].many.split(' ')[0]} aloud`}
                    onClick={() => onRead(openKind)}
                  >
                    <Volume2 className='h-4 w-4' aria-hidden='true' />
                  </Bubble>
                )}
              <Bubble isInline label='Close' onClick={close}>
                <X className='h-4 w-4' aria-hidden='true' />
              </Bubble>
            </div>
          </div>
          <div className='max-h-44 overflow-y-auto [@media(max-height:700px)]:max-h-32'>
            {getBody()}
          </div>
        </section>
      )}
      <div
        role='group'
        aria-label='Written and used in this step'
        className='flex min-h-10 items-center justify-end gap-2'
      >
        {lastNote !== null && (
          <Bubble
            label='The note from last time'
            isOn={open === 'LAST'}
            isNudged={!isDismissed}
            controls={panelId}
            onClick={() => toggle('LAST')}
          >
            <History className='h-4 w-4' aria-hidden='true' />
          </Bubble>
        )}
        {rows.length > 0 && (
          <Bubble
            label='Amounts for this step'
            isOn={open === 'AMOUNTS'}
            controls={panelId}
            onClick={() => toggle('AMOUNTS')}
          >
            <Scale className='h-4 w-4' aria-hidden='true' />
          </Bubble>
        )}
        {kinds.map((kind) => {
          const count = entries.filter((entry) => entry.kind === kind).length;
          const words = KIND_WORDS[kind];
          return (
            <Bubble
              key={kind}
              label={`${count} ${count === 1 ? words.one : words.many}`}
              isOn={open === kind}
              count={count}
              controls={panelId}
              onClick={() => toggle(kind)}
            >
              <span aria-hidden='true'>{NOTE_KIND_EMOJIS[kind]}</span>
            </Bubble>
          );
        })}
        {onAdd && (
          <Bubble label={ADD_LABEL} isDashed onClick={onAdd}>
            <Plus className='h-4 w-4' aria-hidden='true' />
          </Bubble>
        )}
      </div>
    </div>
  );
}

export default CookStepDock;
