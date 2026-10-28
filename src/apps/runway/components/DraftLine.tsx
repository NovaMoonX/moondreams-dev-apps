import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import PriorityBadge from '@apps/runway/components/PriorityBadge';
import { DRAFT_WORDS, PRIORITY_LABELS } from '@apps/runway/constants';
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
}

/** One envelope's line in a draft: what it got, the priority it was funded at and why. */
function DraftLine({ line, name, emoji, sourceNames }: DraftLineProps) {
  const reason = describeLineReason(line, sourceNames);
  const tieNote = describeTieBreak(line);
  const billShare = describeBillShare(line);
  const isShort = line.shortBy > 0;
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
        <p className='text-muted-foreground text-sm'>{reason}</p>
        {shortText && (
          <p className='text-foreground text-sm font-medium'>{shortText}</p>
        )}
        {tieNote && <p className='text-muted-foreground text-xs'>{tieNote}</p>}
      </div>
    </li>
  );
}

export default DraftLine;
