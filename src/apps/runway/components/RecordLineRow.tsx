import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import PriorityBadge from '@apps/runway/components/PriorityBadge';
import { DRAFT_WORDS } from '@apps/runway/constants';
import type { RecordLine } from '@apps/runway/types';

interface RecordLineRowProps {
  line: RecordLine;
  /** What the line was planned at, shown when it differs from what was confirmed. */
  plannedCents?: number;
}

/** One line of a confirmed day, as it was kept with the name it had then. */
function RecordLineRow({ line, plannedCents }: RecordLineRowProps) {
  const name = line.name === '' ? DRAFT_WORDS.billFallback : line.name;
  const isChanged = plannedCents !== undefined && plannedCents !== line.cents;

  return (
    <li
      className='flex items-start gap-3 p-3'
      aria-label={`${name}: ${formatCents(line.cents)}${line.shortBy > 0 ? `, short by ${formatCents(line.shortBy)}` : ''}`}
    >
      <ItemBadge name={name} emoji={line.emoji} />
      <div className='min-w-0 flex-1'>
        <div className='flex min-h-10 items-start justify-between gap-2'>
          <p className='line-clamp-2 min-w-0 pt-2 font-medium break-words'>
            {name}
          </p>
          <p className='flex h-10 shrink-0 items-center font-semibold whitespace-nowrap tabular-nums'>
            {formatCents(line.cents)}
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
          <PriorityBadge priority={line.tier} />
          {line.shortBy > 0 && (
            <span className='text-foreground text-sm font-medium'>
              {DRAFT_WORDS.shortBy} {formatCents(line.shortBy)}
            </span>
          )}
          {isChanged && (
            <span className='text-muted-foreground text-sm'>
              Planned {formatCents(plannedCents)}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

export default RecordLineRow;
