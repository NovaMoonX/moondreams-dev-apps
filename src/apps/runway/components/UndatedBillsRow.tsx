import { ChevronRight, TriangleAlert } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { BILL_WORDS } from '@apps/runway/constants';

interface UndatedBillsRowProps {
  names: string[];
  onOpen: () => void;
}

/** The bills with no due date, as one warning row that opens the bill or narrows the list to them. */
function UndatedBillsRow({ names, onOpen }: UndatedBillsRowProps) {
  const label =
    names.length === 1
      ? BILL_WORDS.undatedOne(names[0])
      : BILL_WORDS.undatedMany(names.length);

  return (
    <Button
      type='button'
      variant='tertiary'
      className='text-foreground! h-auto min-h-11 w-full items-center justify-start gap-3 rounded-2xl border border-(--runway-warning-edge) bg-(--runway-warning-soft) px-3! py-1.5 text-left font-normal whitespace-normal'
      onClick={onOpen}
    >
      <span
        className='grid size-8 shrink-0 place-items-center rounded-full bg-(--runway-warning-edge)/40 text-(--runway-warning-ink)'
        aria-hidden='true'
      >
        <TriangleAlert className='h-4 w-4' />
      </span>
      <span className='min-w-0 flex-1 text-sm font-medium break-words'>
        {label}
      </span>
      <ChevronRight
        className='text-muted-foreground h-4 w-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default UndatedBillsRow;
