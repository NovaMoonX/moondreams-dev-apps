import SensitiveValue from '@/components/SensitiveValue';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { useAppSelector } from '@/store';
import ItemRow from '@apps/runway/components/ItemRow';
import { effectiveStance, pick } from '@apps/runway/engine/stance';
import { DAY_STATUS_LABELS } from '@apps/runway/constants';
import {
  selectEffectiveSplit,
  selectStance,
  type ListedDay,
} from '@apps/runway/store/selectors/runwaySelectors';

const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  timeZone: 'UTC',
});
const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  timeZone: 'UTC',
});

const getStatusLabel = (day: ListedDay) => {
  if (day.status === 'confirmed') return DAY_STATUS_LABELS.confirmed;
  if (day.status === 'notArrived') return DAY_STATUS_LABELS.notArrived;
  return day.isOverdue ? DAY_STATUS_LABELS.overdue : null;
};

interface IncomeDayCardProps {
  day: ListedDay;
  /** What the plan leaves short on this day, in order; they become one warning line in the detail's place. */
  shorts?: { name: string; shortBy: number }[];
  /** False under a "Confirmed" heading, which already says it. */
  isConfirmedShown?: boolean;
  /** Words that lead the detail line ("Next income day"). */
  lead?: string;
  /** The amount and any shortfall line blur until shown; off inside a flow the person opened on purpose. */
  isPrivate?: boolean;
  onOpen: () => void;
}

/** One income day as a row: the date, where it comes from, one line and the take-home amount; it opens that day. */
function IncomeDayCard({
  day,
  shorts = [],
  isConfirmedShown = true,
  lead,
  isPrivate = false,
  onOpen,
}: IncomeDayCardProps) {
  const stance = effectiveStance(
    useAppSelector(selectStance),
    day.stanceOverride,
  );
  const record = useAppSelector((state) =>
    day.status === 'confirmed' ? selectEffectiveSplit(state, day.dayKey) : null,
  );
  const cents = record?.arrivedCents ?? pick(stance, day.amount, 'income');
  const isRanged =
    day.status !== 'confirmed' && day.amount.lowCents !== day.amount.highCents;
  const statusLabel =
    day.status === 'confirmed' && !isConfirmedShown
      ? null
      : getStatusLabel(day);
  const title = day.sourceName ?? day.payLineName;
  const plain = [
    lead ?? weekdayFormatter.format(day.on),
    day.sourceName ? day.payLineName : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const [firstShort] = shorts;
  const shortFigure = firstShort ? formatCentsShort(firstShort.shortBy) : '';
  const note = firstShort
    ? shorts.length === 1
      ? `${firstShort.name} ${shortFigure} short`
      : `${shorts.length} short, ${firstShort.name} ${shortFigure}`
    : undefined;
  const warningLine = !firstShort ? undefined : shorts.length === 1 ? (
    <>
      {firstShort.name} <SensitiveValue>{shortFigure}</SensitiveValue> short
    </>
  ) : (
    <>
      {shorts.length} short
      <span className='max-[359px]:hidden'>
        {' · '}
        {firstShort.name} <SensitiveValue>{shortFigure}</SensitiveValue>
      </span>
    </>
  );
  const detail = note ?? statusLabel ?? plain;
  const amount = formatCents(cents);

  return (
    <ItemRow
      name={title}
      leading={
        <span
          className='border-border bg-background flex size-10 shrink-0 flex-col items-center justify-center rounded-xl border text-center'
          aria-hidden='true'
        >
          <span className='text-muted-foreground text-[10px] leading-3 font-semibold uppercase'>
            {monthFormatter.format(day.on)}
          </span>
          <span className='text-base leading-5 font-semibold tabular-nums'>
            {new Date(day.on).getUTCDate()}
          </span>
        </span>
      }
      detail={warningLine ? undefined : detail}
      warningLine={warningLine}
      figure={amount}
      isPrivate={isPrivate}
      hiddenAriaLabel={`${formatDateUTC(day.on)}, ${title}. Amount hidden. Open this day`}
      ariaLabel={`${formatDateUTC(day.on)}, ${[title, detail].join(', ')}, ${formatCents(cents)}${isRanged ? ' planned' : ''}. Open this day`}
      onOpen={onOpen}
    />
  );
}

export default IncomeDayCard;
