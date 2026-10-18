import { join } from '@moondreamsdev/dreamer-ui/utils';

import TickMark from '@/components/TickMark';
import type { LineStock } from '@apps/pinch/utils/packages';

interface LineStockMarkerProps {
  stock: LineStock;
  /** The words for it; see `getLineMarkers`. */
  text: string;
}

/** What the pantry says of a recipe line, in quiet words under its amount: a tick when there is enough, the date problem when what there is can't be used, and plainly when there is none. */
function LineStockMarker({ stock, text }: LineStockMarkerProps) {
  return (
    <span
      className={join(
        'flex items-center justify-end gap-1 text-xs font-normal',
        stock.kind === 'PAST' ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {stock.kind === 'HAVE' && <TickMark variant='soft' />}
      <span>{text}</span>
    </span>
  );
}

export default LineStockMarker;
