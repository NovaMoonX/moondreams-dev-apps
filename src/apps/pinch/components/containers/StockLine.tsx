import EatByBadge from '@apps/pinch/components/containers/EatByBadge';
import {
  CONTAINER_PLACE_EMOJIS,
  CONTAINER_PLACE_LABELS,
} from '@apps/pinch/constants';
import { getStockParts, type StockSummary } from '@apps/pinch/utils/containers';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

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
    <span className='text-muted-foreground flex flex-col gap-y-0.5 text-xs font-normal sm:flex-row sm:flex-wrap sm:gap-x-1.5'>
      {parts.map((part, index) => (
        <span
          key={part.place}
          className='flex items-center gap-x-1.5 whitespace-nowrap'
        >
          {index > 0 && (
            <span aria-hidden='true' className='max-sm:hidden'>
              ·
            </span>
          )}
          <span>
            <span aria-hidden='true'>{CONTAINER_PLACE_EMOJIS[part.place]}</span>{' '}
            {formatServings(part.servings)}
            <span className='sr-only'>
              {' '}
              in the {CONTAINER_PLACE_LABELS[part.place].toLowerCase()}
            </span>
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
