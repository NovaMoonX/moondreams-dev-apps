import { useState } from 'react';
import { ChevronRight, Receipt, TriangleAlert } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import {
  AUTO_PAY_WORDS,
  DUE_WORDS,
  HORIZON_WORDS,
} from '@apps/runway/constants';
import DueBillsCard from '@apps/runway/components/DueBillsCard';
import type { Lookahead } from '@apps/runway/engine/lookahead';
import { useDueCostRows } from '@apps/runway/hooks/useDueCostRows';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

interface DueBillsRowProps {
  lookahead: Lookahead | null;
  today: number;
  onOpenBill: (billId: string) => void;
}

function DueBillsRow({ lookahead, today, onOpenBill }: DueBillsRowProps) {
  const costRows = useDueCostRows(lookahead, today);
  const { isAllDueOpen, closeAllDue } = useRunwayUrlState();
  const [isPicked, setIsPicked] = useState(false);
  const due = [
    ...(lookahead?.due ?? []).map((entry) => ({
      dueOn: entry.dueOn,
      isOverdue: entry.isOverdue,
      name: entry.name === '' ? AUTO_PAY_WORDS.fallbackBillName : entry.name,
    })),
    ...costRows.map(({ entry }) => ({
      dueOn: entry.dueOn,
      isOverdue: entry.isOverdue,
      name: HORIZON_WORDS.costLineName(entry.costName, entry.itemName),
    })),
  ].sort((a, b) => a.dueOn - b.dueOn);
  if (due.length === 0) return null;

  const isAnyLate = due.some(({ isOverdue }) => isOverdue);
  const isOpen = isPicked || isAllDueOpen;
  const close = () => {
    setIsPicked(false);
    closeAllDue();
  };

  return (
    <>
      <Button
        type='button'
        variant='tertiary'
        className='bg-card border-border hover:bg-muted/60 text-foreground! h-auto min-h-11 w-full items-center justify-start gap-3 rounded-2xl border px-3! py-1.5 text-left font-normal whitespace-normal'
        onClick={() => setIsPicked(true)}
      >
        {isAnyLate ? (
          <span
            className='grid size-8 shrink-0 place-items-center rounded-full bg-(--runway-warning-edge)/40 text-(--runway-warning-ink)'
            aria-hidden='true'
          >
            <TriangleAlert className='h-4 w-4' />
          </span>
        ) : (
          <Receipt
            className='text-muted-foreground h-5 w-5 shrink-0'
            aria-hidden='true'
          />
        )}
        <span className='min-w-0 flex-1 text-sm font-medium break-words'>
          <span className='sm:hidden'>
            {DUE_WORDS.rowCount(due.length, isAnyLate, costRows.length > 0)}
          </span>
          <span className='max-sm:hidden'>
            {DUE_WORDS.rowFirst(due[0].name, due.length - 1, isAnyLate)}
          </span>
        </span>
        <ChevronRight
          className='text-muted-foreground h-4 w-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
      <DetailSheet
        isOpen={isOpen}
        onClose={close}
        title={isAnyLate ? DUE_WORDS.titleLate : DUE_WORDS.title}
        actions={<ValuesEyeButton />}
      >
        <DueBillsCard
          lookahead={lookahead}
          today={today}
          onOpenBill={(billId) => {
            close();
            onOpenBill(billId);
          }}
          overflow='all'
        />
      </DetailSheet>
    </>
  );
}

export default DueBillsRow;
