import EatByBadge from '@apps/pinch/components/containers/EatByBadge';
import {
  CONTAINER_PLACE_EMOJIS,
  CONTAINER_PLACE_LABELS,
} from '@apps/pinch/constants';
import { getStockParts, type StockSummary } from '@apps/pinch/utils/containers';

interface StockLineProps {
  summary: StockSummary | undefined;
}

function StockLine({ summary }: StockLineProps) {
  if (!summary) {
    return null;
  }

  const parts = getStockParts(summary);
  if (parts.length === 0) {
    return null;
  }

  return (
    <span className='text-muted-foreground flex flex-col gap-y-0.5 text-xs font-normal sm:flex-row sm:flex-wrap sm:gap-x-3'>
      {parts.map((part) => (
        <span
          key={part.place}
          className='flex flex-wrap items-center gap-x-1.5 gap-y-0.5'
        >
          <span className='whitespace-nowrap'>
            <span aria-hidden='true'>{CONTAINER_PLACE_EMOJIS[part.place]}</span>{' '}
            {part.servings}
            <span className='sr-only'>
              {part.servings === 1 ? ' serving' : ' servings'}
            </span>{' '}
            in the {CONTAINER_PLACE_LABELS[part.place].toLowerCase()}
          </span>
          {part.due && (
            <EatByBadge state={part.due.state} label={part.due.label} />
          )}
        </span>
      ))}
    </span>
  );
}

export default StockLine;
