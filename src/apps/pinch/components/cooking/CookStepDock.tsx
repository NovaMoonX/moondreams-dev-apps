import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { PenLine, Pencil, Volume2 } from 'lucide-react';

import ActionChips, { type ActionChip } from '@/components/ActionChips';
import ClampedText from '@/components/ClampedText';
import type { CookRow } from '@apps/pinch/components/cooking/CookIngredientsView';
import { CookAmountRows } from '@apps/pinch/components/cooking/CookStepAmounts';
import CookStepTray from '@apps/pinch/components/cooking/CookStepTray';
import { NOTE_KIND_EMOJIS } from '@apps/pinch/constants';
import type { RecipeNote } from '@apps/pinch/types';
import { getAmountsSummary } from '@apps/pinch/utils/cooks';

type DockKind = 'TIP' | 'NOTE' | 'CHANGE';

const KINDS: DockKind[] = ['TIP', 'NOTE', 'CHANGE'];

const KIND_WORDS: Record<DockKind, { one: string; many: string }> = {
  TIP: { one: 'tip', many: 'tips' },
  NOTE: { one: 'note', many: 'notes' },
  CHANGE: { one: 'change to make', many: 'changes to make' },
};

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
  className?: string;
}

/**
 * The bottom of a step: a row of chips, one for what the step uses and one for each kind of thing written for it (with its count), so what exists is visible at a glance and nothing else is drawn. A tap decides what the card shows under the row; a second tap puts it away. A step with nothing written is just the ingredient tray.
 */
function CookStepDock({
  rows,
  isAmountNoteShown,
  entries,
  onEdit,
  onApplyChange,
  onRead,
  className,
}: CookStepDockProps) {
  const [selected, setSelected] = useState<'AMOUNTS' | DockKind | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  if (entries.length === 0) {
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
  const shown = entries.filter((entry) => entry.kind === selected);
  const summary = rows.length > 0 ? getAmountsSummary(rows) : null;
  const toggle = (next: 'AMOUNTS' | DockKind) => {
    setSelected((current) => (current === next ? null : next));
    window.requestAnimationFrame(() =>
      sectionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    );
  };

  const chipClass = (isOn: boolean) =>
    join(
      'h-10 shrink-0 gap-1.5 rounded-full px-2.5 text-sm',
      isOn && 'bg-accent! border-primary! border',
    );

  const getActions = (entry: RecipeNote): ActionChip[] => [
    ...(entry.kind === 'CHANGE'
      ? [
          {
            key: 'apply',
            icon: <PenLine className='h-4 w-4' />,
            label: 'Update the recipe',
            onClick: () => onApplyChange(entry.id),
          },
        ]
      : []),
    {
      key: 'edit',
      icon: <Pencil className='h-4 w-4' />,
      label: 'Edit',
      description: `Edit your ${entry.kind === 'TIP' ? 'tip' : entry.kind === 'CHANGE' ? 'change' : 'note'}`,
      onClick: () => onEdit(entry.id),
    },
  ];

  return (
    <section
      ref={sectionRef}
      aria-label='Written and used in this step'
      className={join(
        'bg-muted/50 border-border scroll-mb-28 space-y-2 rounded-2xl border p-2',
        className,
      )}
    >
      <div className='flex flex-wrap gap-1.5'>
        {summary && (
          <Button
            type='button'
            variant='secondary'
            aria-pressed={selected === 'AMOUNTS'}
            aria-label='Amounts for this step'
            className={chipClass(selected === 'AMOUNTS')}
            onClick={() => toggle('AMOUNTS')}
          >
            Amounts
          </Button>
        )}
        {kinds.map((kind) => {
          const count = entries.filter((entry) => entry.kind === kind).length;
          const words = KIND_WORDS[kind];
          return (
            <Button
              key={kind}
              type='button'
              variant='secondary'
              aria-pressed={selected === kind}
              aria-label={`${count} ${count === 1 ? words.one : words.many}`}
              className={chipClass(selected === kind)}
              onClick={() => toggle(kind)}
            >
              <span aria-hidden='true'>{NOTE_KIND_EMOJIS[kind]}</span>
              <span aria-hidden='true'>{count}</span>
            </Button>
          );
        })}
      </div>
      {selected === null && summary && (
        <p className='text-muted-foreground line-clamp-2 px-2 pb-1 text-sm wrap-break-word [@media(max-height:700px)]:hidden'>
          {summary.text}
        </p>
      )}
      {selected === 'AMOUNTS' && (
        <CookAmountRows rows={rows} className='border-border mx-2 border-t pb-1' />
      )}
      {selected === 'AMOUNTS' && isAmountNoteShown && (
        <p className='text-muted-foreground px-2 pb-1 text-xs'>
          Amounts written in this step stay as they are.
        </p>
      )}
      {selected !== null && selected !== 'AMOUNTS' && (
        <div className='px-2 pb-1'>
          <ul className='divide-border divide-y'>
            {shown.map((entry) => (
              <li key={entry.id} className='space-y-1.5 py-2.5 first:pt-1'>
                <div className='flex gap-2'>
                  <span aria-hidden='true' className='w-5 shrink-0 text-center'>
                    {NOTE_KIND_EMOJIS[entry.kind]}
                  </span>
                  <div className='min-w-0 flex-1'>
                    <ClampedText text={entry.text ?? ''} maxLines={4} />
                    {entry.kind === 'CHANGE' && (entry.reason ?? '') !== '' && (
                      <p className='text-muted-foreground text-xs wrap-break-word'>
                        Why: {entry.reason}
                      </p>
                    )}
                  </div>
                </div>
                <ActionChips actions={getActions(entry)} className='pl-7' />
              </li>
            ))}
          </ul>
          {onRead && (
            <Button
              type='button'
              variant='tertiary'
              className='text-foreground! h-10 gap-2 px-2! font-normal'
              onClick={() => onRead(selected)}
            >
              <Volume2 className='h-4 w-4' aria-hidden='true' />
              Read aloud
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

export default CookStepDock;
