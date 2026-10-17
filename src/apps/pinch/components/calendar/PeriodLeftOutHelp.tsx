import HelpTip from '@/components/HelpTip';
import { countLeftOutIngredients } from '@apps/pinch/utils/gaps';
import type { PeriodStats } from '@apps/pinch/utils/stats';

interface PeriodLeftOutHelpProps {
  stats: Pick<PeriodStats, 'leftOut' | 'byDay'>;
  todayKey: string;
}

const pluralize = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/** The warning icon that says what a partial period total leaves out, the same words on the front tile and in the summary sheet. */
function PeriodLeftOutHelp({ stats, todayKey }: PeriodLeftOutHelpProps) {
  const noPriceCount = countLeftOutIngredients(
    stats.leftOut.filter((gap) => gap.kind === 'NO_PRODUCT'),
  );
  const noSizeCount = countLeftOutIngredients(
    stats.leftOut.filter((gap) => gap.kind === 'NOT_COMPARABLE'),
  );
  const reasons = [
    noPriceCount > 0
      ? `${pluralize(noPriceCount, 'ingredient')} with no price yet`
      : null,
    noSizeCount > 0
      ? `${pluralize(noSizeCount, 'ingredient')} whose package size can't be compared`
      : null,
  ].filter(Boolean);
  const hasPassedDay = stats.byDay.some((day) => day.dayKey < todayKey);

  return (
    <HelpTip variant='warning' title="What's left out" placement='bottom'>
      <p>Leaves out {reasons.join(' and ')}.</p>
      {hasPassedDay && (
        <p className='text-muted-foreground'>
          Days that have passed keep the prices they had, and a price you add
          now counts from today on.
        </p>
      )}
    </HelpTip>
  );
}

export default PeriodLeftOutHelp;
