import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, ListOrdered } from 'lucide-react';

import SummaryRow from '@/components/SummaryRow';
import { HELM_COPY } from '@apps/helm/constants';
import { useImportancePlace } from '@apps/helm/hooks/useImportancePlace';

interface ImportancePlaceRowProps {
  id: string;
  /** A project's or goal's quiet row, or a habit's summary row. */
  variant: 'quiet' | 'summary';
  onOpen: (focusId: string) => void;
}

/** Where this thing stands in what matters most, in words; it opens the order scrolled to it. Health and care read "Always kept" and open nothing. */
function ImportancePlaceRow({ id, variant, onOpen }: ImportancePlaceRowProps) {
  const place = useImportancePlace(id);
  if (!place) return null;
  const open = place.canOpen ? () => onOpen(place.focusId) : undefined;

  if (variant === 'summary') {
    return (
      <SummaryRow label={HELM_COPY.importanceTitle} onClick={open}>
        {place.text}
      </SummaryRow>
    );
  }
  const mark = (
    <ListOrdered
      className='text-muted-foreground size-3.5 shrink-0'
      aria-hidden='true'
    />
  );
  const words = (
    <span className='text-muted-foreground min-w-0 flex-1 text-[13px] break-words'>
      {place.text}
    </span>
  );
  return open ? (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto min-h-10 w-full min-w-0 items-center justify-start gap-2 px-1 py-1.5 text-left font-normal'
      aria-label={`${HELM_COPY.importanceTitle}: ${place.text}`}
      onClick={open}
    >
      {mark}
      {words}
      <ChevronRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  ) : (
    <div className='flex min-h-10 items-center gap-2 px-1'>
      {mark}
      {words}
    </div>
  );
}

export default ImportancePlaceRow;
