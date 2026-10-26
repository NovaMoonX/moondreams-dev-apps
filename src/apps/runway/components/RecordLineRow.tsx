import BeforeAfterRow from '@/components/BeforeAfterRow';
import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import {
  CONFIRM_WORDS,
  DRAFT_WORDS,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import type { RecordLine } from '@apps/runway/types';

interface RecordLineRowProps {
  line: RecordLine;
  /** What the line was planned at, shown when it differs from what was confirmed. */
  plannedCents?: number;
  /** The person's note on the change. */
  note?: string | null;
}

/** One line of a confirmed day, as it was kept with the name it had then. */
function RecordLineRow({ line, plannedCents, note }: RecordLineRowProps) {
  const name = line.name === '' ? DRAFT_WORDS.billFallback : line.name;
  const isChanged = plannedCents !== undefined && plannedCents !== line.cents;
  const shortText =
    line.shortBy > 0
      ? `${DRAFT_WORDS.shortBy} ${formatCents(line.shortBy)}`
      : null;

  if (isChanged) {
    return (
      <BeforeAfterRow
        title={name}
        leading={<ItemBadge name={name} emoji={line.emoji} />}
        before={formatCents(plannedCents)}
        after={formatCents(line.cents)}
        beforeLabel={CONFIRM_WORDS.planned}
        afterLabel={CONFIRM_WORDS.confirmed}
        detail={
          shortText || note ? (
            <p className='text-sm break-words'>
              {[shortText, note].filter(Boolean).join('. ')}
            </p>
          ) : undefined
        }
      />
    );
  }

  return (
    <ItemRow
      name={name}
      emoji={line.emoji}
      detail={shortText ?? PRIORITY_LABELS[line.tier]}
      isDetailStrong={shortText !== null}
      figure={formatCents(line.cents)}
      ariaLabel={`${name}: ${formatCents(line.cents)}${shortText ? `, ${shortText.toLowerCase()}` : ''}`}
    />
  );
}

export default RecordLineRow;
