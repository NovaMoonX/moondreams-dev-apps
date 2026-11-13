import { ChevronRight, Info } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import BackLink from '@/components/BackLink';
import PlanChangeRow from '@apps/runway/components/PlanChangeRow';
import { PLAN_CHANGE_WORDS } from '@apps/runway/constants';
import type { PlanChange } from '@apps/runway/engine/planChanges';
import { describePlanChanges } from '@apps/runway/utils/planChangeText';

interface PlanChangeNoticeProps {
  changes: readonly PlanChange[];
  onOpen: () => void;
}

/** One quiet line under an income day's hero: what a planned change makes different this time, naming items and no figures. It opens the list. */
export function PlanChangeNotice({ changes, onOpen }: PlanChangeNoticeProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='text-foreground! border-border bg-muted/60 h-auto min-h-11 w-full items-center justify-start gap-2.5 rounded-xl border px-3! py-2 text-left font-normal whitespace-normal'
      onClick={onOpen}
    >
      <Info
        className='text-muted-foreground h-4 w-4 shrink-0'
        aria-hidden='true'
      />
      <span className='min-w-0 flex-1 text-sm break-words'>
        {PLAN_CHANGE_WORDS.notice(describePlanChanges(changes))}
      </span>
      <ChevronRight
        className='text-muted-foreground h-4 w-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

interface PlanChangesViewProps {
  changes: readonly PlanChange[];
  today: number;
  onBack: () => void;
}

/** Each change since the last pay of this income, as a row that opens its item. */
export function PlanChangesView({
  changes,
  today,
  onBack,
}: PlanChangesViewProps) {
  return (
    <div className='space-y-4'>
      <BackLink onBack={onBack} />
      <h2 className='text-2xl leading-tight font-semibold'>
        {PLAN_CHANGE_WORDS.viewTitle}
      </h2>
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {changes.map((change) => (
          <PlanChangeRow key={change.itemId} change={change} today={today} />
        ))}
      </ul>
    </div>
  );
}
