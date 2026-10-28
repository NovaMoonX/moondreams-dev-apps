import type { ReactNode } from 'react';
import { ChevronRight, TriangleAlert, Undo2 } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import RevealChip from '@/components/RevealChip';
import SensitiveValue from '@/components/SensitiveValue';
import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import {
  CONFIRM_COVER_WORDS,
  CONFIRM_FLOW_WORDS,
  CORRECT_COVER_WORDS,
  COVER_GROWN_WORDS,
} from '@apps/runway/constants';
import type { Cents } from '@apps/runway/types';

interface CoverCardProps {
  id: string;
  /** What the items get beyond the money for them. */
  gapCents: Cents;
  /** How much of the gap Free to spend can cover now. */
  coverableCents: Cents;
  /** What the person chose to cover; 0 until they tap. */
  coverCents: Cents;
  /** Free to spend now, before the cover. */
  freeCents: Cents;
  /** Free to spend once the cover is taken. */
  freeAfterCents: Cents;
  /** The words before the figure, when Free to spend is not the plain figure ("Without this day's leftover, Free to spend is"). */
  freeLead?: string;
  isHidden: boolean;
  isDisabled: boolean;
  onCover: () => void;
  onUndo: () => void;
}

/** The offer to cover a day's gap from Free to spend in one tap, and once taken, what it covered with its Undo. */
export function CoverCard({
  id,
  gapCents,
  coverableCents,
  coverCents,
  freeCents,
  freeAfterCents,
  freeLead = CONFIRM_FLOW_WORDS.coverLead,
  isHidden,
  isDisabled,
  onCover,
  onUndo,
}: CoverCardProps) {
  if (coverCents > 0) {
    const covered = (
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='min-w-0 flex-1 text-sm' role='status'>
          {CONFIRM_COVER_WORDS.coveredLead}{' '}
          <SensitiveValue>{formatCents(coverCents)}</SensitiveValue>{' '}
          {CONFIRM_COVER_WORDS.coveredTail} {CONFIRM_FLOW_WORDS.coveredAfter}{' '}
          <SensitiveValue>{formatCents(freeAfterCents)}</SensitiveValue>.
        </p>
        <RevealChip
          icon={<Undo2 className='h-4 w-4' aria-hidden='true' />}
          onClick={onUndo}
        >
          {CONFIRM_FLOW_WORDS.undo}
        </RevealChip>
      </div>
    );
    if (coverableCents <= coverCents) return covered;
    return (
      <div className='space-y-3'>
        {covered}
        <p className='text-sm'>
          {isHidden
            ? COVER_GROWN_WORDS.grownHidden
            : COVER_GROWN_WORDS.grown(formatCents(gapCents))}
        </p>
        <Button
          id={id}
          type='button'
          variant='secondary'
          className='w-full'
          disabled={isDisabled}
          onClick={onCover}
        >
          {isHidden
            ? COVER_GROWN_WORDS.coverMoreHidden
            : COVER_GROWN_WORDS.coverMore(formatCents(coverableCents))}
        </Button>
      </div>
    );
  }
  if (coverableCents === 0) {
    return (
      <p className='text-sm'>
        {isHidden
          ? CORRECT_COVER_WORDS.coverNoneHidden
          : CONFIRM_FLOW_WORDS.coverNone(formatCents(gapCents))}
      </p>
    );
  }
  return (
    <div className='space-y-3'>
      {isHidden ? (
        <p className='text-sm'>{CONFIRM_COVER_WORDS.coverHidden}</p>
      ) : (
        <p className='text-sm'>
          {freeLead} <SensitiveValue>{formatCents(freeCents)}</SensitiveValue>
          {coverableCents === gapCents
            ? CONFIRM_COVER_WORDS.coverAll
            : CONFIRM_COVER_WORDS.coverPart}
        </p>
      )}
      <Button
        id={id}
        type='button'
        variant='secondary'
        className='w-full'
        disabled={isDisabled}
        onClick={onCover}
      >
        {isHidden
          ? CONFIRM_COVER_WORDS.coverHiddenAction
          : coverableCents === gapCents
            ? CONFIRM_FLOW_WORDS.coverAction
            : CONFIRM_FLOW_WORDS.coverPartAction}
      </Button>
    </div>
  );
}

export interface SuggestedCut {
  lineId: string;
  name: string;
  emoji: string | null;
  fromCents: Cents;
  toCents: Cents;
}

const SUGGESTIONS_SHOWN = 3;

interface CutsSectionProps {
  id: string;
  suggested: readonly SuggestedCut[];
  /** How many items got less from the last "Use these", while its Undo stands; null otherwise. */
  usedCount: number | null;
  isCovered: boolean;
  isOfferingCover: boolean;
  isDisabled: boolean;
  onApply: () => void;
  onUndo: () => void;
}

/** "What gets less": the cuts by priority, offered as a whole, and once used, how many items got less with its Undo. Null when there is nothing to say. */
export function CutsSection({
  id,
  suggested,
  usedCount,
  isCovered,
  isOfferingCover,
  isDisabled,
  onApply,
  onUndo,
}: CutsSectionProps) {
  if (usedCount === null && suggested.length === 0) return null;
  return (
    <div className='space-y-3'>
      {usedCount !== null && (
        <div className='border-border flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3'>
          <p className='min-w-0 flex-1 text-sm' role='status'>
            {CONFIRM_FLOW_WORDS.used(usedCount)}
          </p>
          <RevealChip
            icon={<Undo2 className='h-4 w-4' aria-hidden='true' />}
            onClick={onUndo}
          >
            {CONFIRM_FLOW_WORDS.undo}
          </RevealChip>
        </div>
      )}
      {suggested.length > 0 && (
        <div className='space-y-3'>
          <p className='text-muted-foreground text-sm'>
            {isOfferingCover
              ? CONFIRM_COVER_WORDS.suggestInstead
              : isCovered
                ? CONFIRM_COVER_WORDS.suggestRest
                : CONFIRM_FLOW_WORDS.suggestIntro}
          </p>
          <ul className='border-border divide-border divide-y rounded-2xl border'>
            {suggested.slice(0, SUGGESTIONS_SHOWN).map((cut) => (
              <li key={cut.lineId} className='flex items-start gap-3 p-3'>
                <ItemBadge name={cut.name} emoji={cut.emoji} />
                <span className='min-w-0 flex-1'>
                  <span className='block text-base font-medium break-words'>
                    <span className='line-clamp-2'>{cut.name}</span>
                  </span>
                  <span className='text-muted-foreground block text-sm'>
                    <SensitiveValue>
                      {CONFIRM_FLOW_WORDS.suggestDetail(
                        formatCents(cut.fromCents),
                      )}
                    </SensitiveValue>
                  </span>
                </span>
                <span className='text-base font-semibold whitespace-nowrap tabular-nums'>
                  <SensitiveValue>{formatCents(cut.toCents)}</SensitiveValue>
                </span>
              </li>
            ))}
          </ul>
          {suggested.length > SUGGESTIONS_SHOWN && (
            <p className='text-muted-foreground text-sm'>
              {CONFIRM_FLOW_WORDS.suggestMore(
                suggested.length - SUGGESTIONS_SHOWN,
              )}
            </p>
          )}
          <Button
            id={id}
            type='button'
            variant='secondary'
            className='w-full'
            disabled={isDisabled}
            onClick={onApply}
          >
            {CONFIRM_FLOW_WORDS.useThese}
          </Button>
        </div>
      )}
    </div>
  );
}

interface BlockerDoorProps {
  text: string;
  /** False inside a view that has no fix to scroll to; the note then stays words. */
  isDoor: boolean;
  onOpen: () => void;
}

/** A disabled primary's reason in the pinned footer, with a warning icon, as a door to the fix. */
export function BlockerDoor({ text, isDoor, onOpen }: BlockerDoorProps) {
  const icon: ReactNode = (
    <TriangleAlert
      key='icon'
      className='text-warning mt-0.5 h-4 w-4 shrink-0'
      aria-hidden='true'
    />
  );
  const words = (
    <span key='words' className='text-foreground min-w-0 flex-1'>
      {text}
    </span>
  );
  if (!isDoor) {
    return (
      <span className='flex items-start gap-2'>
        {icon}
        {words}
      </span>
    );
  }
  return (
    <Button
      type='button'
      variant='tertiary'
      className='h-auto min-h-10 w-full items-start justify-between gap-2 px-0! text-left text-xs font-normal whitespace-normal'
      onClick={onOpen}
    >
      {icon}
      {words}
      <ChevronRight
        className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}
