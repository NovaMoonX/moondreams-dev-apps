import { Button } from '@moondreamsdev/dreamer-ui/components';

import { formatCents } from '@/utils/moneyUtils';
import RangeNote from '@apps/runway/components/RangeNote';
import ItemBadge from '@apps/runway/components/ItemBadge';
import PriorityBadge from '@apps/runway/components/PriorityBadge';
import { DRAFT_WORDS, PRIORITY_LABELS } from '@apps/runway/constants';
import type { HoldChoice } from '@apps/runway/types';
import type { DraftLine as DraftLineData } from '@apps/runway/engine/draft';
import {
  describeBillShare,
  describeLineReason,
  describeTieBreak,
} from '@apps/runway/utils/draftText';

interface DraftLineProps {
  line: DraftLineData;
  name: string;
  emoji: string | null;
  sourceNames: Record<string, string>;
  /** Answers a short pairing; absent where the line cannot be answered. */
  onChoose?: (line: DraftLineData, choice: HoldChoice) => void;
  isChoosing?: boolean;
}

/** One envelope's line in a draft: what it got, the priority it was funded at and why. */
function DraftLine({
  line,
  name,
  emoji,
  sourceNames,
  onChoose,
  isChoosing = false,
}: DraftLineProps) {
  const reason = describeLineReason(line, sourceNames);
  const tieNote = describeTieBreak(line);
  const billShare = describeBillShare(line);
  const isShort = line.shortBy > 0;
  const state = line.pairing?.state ?? null;
  const source =
    line.sourceId !== null && Object.hasOwn(sourceNames, line.sourceId)
      ? sourceNames[line.sourceId]
      : DRAFT_WORDS.unnamedSource;
  const shortSentence = `${name} is ${formatCents(line.shortBy)} short from ${source}.`;
  const getPairingNote = () => {
    if (state === 'held') {
      const held = line.pairing?.heldCents ?? 0;
      return held > 0
        ? `${shortSentence} ${formatCents(held)} is held until you choose.`
        : `${shortSentence} It stays short until you choose.`;
    }
    if (state === 'offered') return shortSentence;
    if (state === 'leftShort')
      return `${DRAFT_WORDS.leftShort}. ${shortSentence}`;
    if (state === 'toppedUp' && isShort) return DRAFT_WORDS.toppedUp;
    return null;
  };
  const pairingNote = getPairingNote();
  const choices: { choice: HoldChoice; label: string }[] =
    state === 'held'
      ? [
          { choice: 'topUp', label: DRAFT_WORDS.topUp },
          { choice: 'leaveShort', label: DRAFT_WORDS.leaveShort },
        ]
      : state === 'offered' || state === 'leftShort'
        ? [{ choice: 'topUp', label: DRAFT_WORDS.topUp }]
        : [];
  const shortText = isShort
    ? `${DRAFT_WORDS.shortBy} ${formatCents(line.shortBy)}`
    : null;

  return (
    <li
      className='flex items-start gap-3 p-3'
      aria-label={`${name}: ${PRIORITY_LABELS[line.tier]}, ${formatCents(line.cents)}. ${billShare ? `${billShare}. ` : ''}${reason}${shortText ? `. ${shortText}` : ''}`}
    >
      <ItemBadge name={name} emoji={emoji} />
      <div className='min-h-10 min-w-0 flex-1'>
        <div className='flex min-h-10 items-start justify-between gap-2'>
          <p className='line-clamp-2 min-w-0 pt-2 font-medium break-words'>
            {name}
          </p>
          <div className='flex h-10 shrink-0 items-center gap-2'>
            <span className='max-sm:hidden'>
              <PriorityBadge priority={line.tier} />
            </span>
            <p className='font-semibold whitespace-nowrap tabular-nums'>
              {formatCents(line.cents)}
            </p>
          </div>
        </div>
        <div className='pb-1 sm:hidden'>
          <PriorityBadge priority={line.tier} />
        </div>
        {billShare && (
          <p className='text-muted-foreground text-sm'>{billShare}</p>
        )}
        {line.bill?.ranged && (
          <RangeNote
            range={line.bill.ranged.range}
            stance={line.bill.ranged.stance}
            side='expense'
            isOwnStance={line.bill.ranged.isOwnStance}
          />
        )}
        {pairingNote === null ? (
          <p className='text-muted-foreground text-sm'>{reason}</p>
        ) : (
          <p className='text-foreground text-sm'>{pairingNote}</p>
        )}
        {shortText && pairingNote === null && (
          <p className='text-foreground text-sm font-medium'>{shortText}</p>
        )}
        {onChoose && choices.length > 0 && (
          <div className='flex flex-wrap gap-2 pt-2'>
            {choices.map(({ choice, label }) => (
              <Button
                key={choice}
                type='button'
                variant='secondary'
                disabled={isChoosing}
                onClick={() => onChoose(line, choice)}
              >
                {label}
              </Button>
            ))}
          </div>
        )}
        {tieNote && <p className='text-muted-foreground text-xs'>{tieNote}</p>}
      </div>
    </li>
  );
}

export default DraftLine;
