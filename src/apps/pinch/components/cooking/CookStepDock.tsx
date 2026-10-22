import { useRef, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, History, PenLine, Pencil, Scale, Volume2 } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
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

const NO_NOTES: RecipeNote[] = [];
const NO_STEPS: string[] = [];

interface ViewButtonProps {
  label: string;
  isOn: boolean;
  count?: number;
  onClick: () => void;
  children: ReactNode;
}

/** One view's icon in the switcher: 32px visible, 40px to hit, its count a small badge on the corner. */
function ViewButton({ label, isOn, count, onClick, children }: ViewButtonProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      aria-pressed={isOn}
      aria-label={label}
      title={label}
      className={join(
        'text-foreground! relative size-8 min-w-8 shrink-0 rounded-full px-0! py-0! text-base before:absolute before:-inset-1 before:content-[""]',
        isOn && 'bg-accent! border-primary! border',
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
  onEdit: (id: string) => void;
  /** Opens the recipe's form to make a planned change. */
  onApplyChange: (id: string) => void;
  /** Reads one kind's entries aloud; null where the browser cannot speak. */
  onRead: ((kind: DockKind) => void) | null;
  /** Where the cook starts, the recipe's latest whole-recipe note leads until "Got it"; null on every later step and on a wide screen, which shows it beside the step. */
  lastTime: {
    recipeId: string;
    isDismissed: boolean;
    onGotIt: () => void;
  } | null;
  className?: string;
}

/**
 * The bottom of a step is one container. A row of icons at its top names what it can show (the last note, what the step uses, and each kind of thing written for it with its count) and the one body under it shows one of them, so a person who needs one thing never has the rest on screen. The note from last time leads on the first step until "Got it"; it stays one tap away after. A step with nothing written and no note is just the ingredient tray.
 */
function CookStepDock({
  rows,
  isAmountNoteShown,
  entries,
  onEdit,
  onApplyChange,
  onRead,
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
  const sectionRef = useRef<HTMLElement | null>(null);

  const lastNote =
    lastTime !== null && isNotesReady ? getLastTimeNote(notes, steps) : null;
  if (entries.length === 0 && lastNote === null) {
    return (
      <CookStepTray
        rows={rows}
        isAmountNoteShown={isAmountNoteShown}
        className={className}
      />
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

  const select = (view: DockView) => {
    setSelected(view);
    window.requestAnimationFrame(() =>
      sectionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    );
  };
  const gotIt = () => {
    lastTime?.onGotIt();
    setSelected(null);
  };

  const getActions = (entry: RecipeNote) => [
    {
      key: 'edit',
      icon: <Pencil className='h-4 w-4' />,
      label: 'Edit',
      description: `Edit your ${entry.kind === 'TIP' ? 'tip' : entry.kind === 'CHANGE' ? 'change' : 'note'}`,
      onClick: () => onEdit(entry.id),
    },
  ];

  const getApplyAction = (id: string) => ({
    key: 'apply',
    icon: <PenLine className='h-4 w-4' />,
    label: 'Update the recipe',
    onClick: () => onApplyChange(id),
  });

  const getHeaderAction = () => {
    if (shown === 'LAST' && !isDismissed) {
      return (
        <Button
          type='button'
          variant='secondary'
          className='h-8 shrink-0 gap-1 rounded-full px-3 text-xs before:absolute before:-inset-1 before:content-[""] relative'
          aria-label='Got it, hide this note while you cook'
          onClick={gotIt}
        >
          <Check className='h-3.5 w-3.5' aria-hidden='true' />
          Got it
        </Button>
      );
    }
    if (shown !== 'LAST' && shown !== 'AMOUNTS' && onRead) {
      return (
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          rounded='full'
          aria-label={`Read the ${shown === 'TIP' ? 'tips' : 'notes'} aloud`}
          title='Read aloud'
          className='text-foreground! size-8 shrink-0 p-0 relative before:absolute before:-inset-1 before:content-[""]'
          onClick={() => onRead(shown)}
        >
          <Volume2 className='h-4 w-4' aria-hidden='true' />
        </Button>
      );
    }
    return null;
  };

  const getBody = () => {
    if (shown === 'LAST' && lastNote !== null) {
      const body = getNoteSummary(lastNote, formatDateShort).body;
      const isChangedSince =
        lastTweakAt !== null && lastTweakAt > lastNote.createdAt;
      return (
        <div className='space-y-0.5 px-2 pb-1'>
          <p className='text-muted-foreground text-xs font-medium'>
            Last time · {formatDateShort(lastNote.createdAt)}
          </p>
          <ClampedText
            text={leadWithAdvice(body)}
            maxLines={isShort ? 2 : 4}
          />
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
        <div className='px-2 pb-1'>
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
            <p className='line-clamp-2 text-sm wrap-break-word [@media(max-height:700px)]:hidden'>
              {summary.text}
            </p>
          )}
        </div>
      );
    }
    return (
      <ul
        className={join(
          'divide-border divide-y px-2',
          isShort && 'max-h-28 overflow-y-auto',
        )}
      >
        {shownEntries.map((entry) => (
          <li key={entry.id} className='py-1.5 first:pt-0 last:pb-0'>
            <div className='flex items-start gap-2'>
              <span
                aria-hidden='true'
                className='w-5 shrink-0 pt-0.5 text-center'
              >
                {NOTE_KIND_EMOJIS[entry.kind]}
              </span>
              <div className='min-w-0 flex-1 pt-0.5'>
                <ClampedText text={entry.text ?? ''} maxLines={isShort ? 2 : 4} />
                {entry.kind === 'CHANGE' && (entry.reason ?? '') !== '' && (
                  <p className='text-muted-foreground text-xs wrap-break-word'>
                    Why: {entry.reason}
                  </p>
                )}
              </div>
              <ActionChips
                isIconOnly
                label='Your entry'
                className='shrink-0 flex-nowrap gap-1'
                actions={[
                  ...(entry.kind === 'CHANGE' && isShort
                    ? [getApplyAction(entry.id)]
                    : []),
                  ...getActions(entry),
                ]}
              />
            </div>
            {entry.kind === 'CHANGE' && !isShort && (
              <ActionChips
                className='pl-7'
                actions={[getApplyAction(entry.id)]}
              />
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <section
      ref={sectionRef}
      aria-label='Written and used in this step'
      className={join(
        'bg-muted/50 border-border scroll-mb-28 space-y-1 rounded-2xl border p-2',
        className,
      )}
    >
      <div className='flex min-h-10 items-center justify-between gap-2 px-1'>
        <div role='group' aria-label='What to show' className='flex gap-2'>
          {views.includes('LAST') && (
            <ViewButton
              label='The note from last time'
              isOn={shown === 'LAST'}
              onClick={() => select('LAST')}
            >
              <History className='h-4 w-4' aria-hidden='true' />
            </ViewButton>
          )}
          {views.includes('AMOUNTS') && (
            <ViewButton
              label='Amounts for this step'
              isOn={shown === 'AMOUNTS'}
              onClick={() => select('AMOUNTS')}
            >
              <Scale className='h-4 w-4' aria-hidden='true' />
            </ViewButton>
          )}
          {kinds.map((kind) => {
            const count = entries.filter((entry) => entry.kind === kind).length;
            const words = KIND_WORDS[kind];
            return (
              <ViewButton
                key={kind}
                label={`${count} ${count === 1 ? words.one : words.many}`}
                isOn={shown === kind}
                count={count}
                onClick={() => select(kind)}
              >
                <span aria-hidden='true'>{NOTE_KIND_EMOJIS[kind]}</span>
              </ViewButton>
            );
          })}
        </div>
        {getHeaderAction()}
      </div>
      {getBody()}
    </section>
  );
}

export default CookStepDock;
