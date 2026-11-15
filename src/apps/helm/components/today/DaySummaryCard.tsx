import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { HELM_COPY } from '@apps/helm/constants';
import { useDaySummary } from '@apps/helm/hooks/useDaySummary';
import type { HelmDayCounts } from '@apps/helm/types';

const ROWS: [keyof HelmDayCounts, (count: number) => string][] = [
  ['messages', HELM_COPY.daySummaryMessages],
  ['tasksAdded', HELM_COPY.daySummaryTasksAdded],
  ['keyDatesAdded', HELM_COPY.daySummaryKeyDatesAdded],
  ['notesAdded', HELM_COPY.daySummaryNotesAdded],
  ['factsAdded', HELM_COPY.daySummaryFactsAdded],
  ['peopleAdded', HELM_COPY.daySummaryPeopleAdded],
  ['placesAdded', HELM_COPY.daySummaryPlacesAdded],
  ['tasksDone', HELM_COPY.daySummaryTasksDone],
  ['planned', HELM_COPY.daySummaryPlanned],
  ['answered', HELM_COPY.daySummaryAnswered],
  ['dismissed', HELM_COPY.daySummaryDismissed],
];

interface DaySummaryCardProps {
  dayKey: string;
}

/** What a past day held, in a sentence or two, with the exact counts one tap away; nothing for a day with no summary. */
function DaySummaryCard({ dayKey }: DaySummaryCardProps) {
  const { user } = useAuth();
  const summary = useDaySummary(user?.uid ?? null, dayKey);
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (!summary) return null;
  const isOpen = openKey === dayKey;
  const rows = ROWS.flatMap(([field, toText]) =>
    (summary.counts[field] ?? 0) > 0 ? [toText(summary.counts[field])] : [],
  );

  return (
    <section className='bg-muted/60 space-y-2 rounded-[14px] p-4'>
      <p className='text-foreground text-[15px] leading-[22px] text-pretty'>
        {summary.text}
      </p>
      {rows.length > 0 && (
        <>
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            aria-expanded={isOpen}
            className="text-muted-foreground relative -ml-2 before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']"
            onClick={() => setOpenKey(isOpen ? null : dayKey)}
          >
            {isOpen ? HELM_COPY.daySummaryHide : HELM_COPY.daySummaryShow}
            <ChevronDown
              className={join('size-4', isOpen && 'rotate-180')}
              aria-hidden='true'
            />
          </Button>
          {isOpen && (
            <ul className='text-muted-foreground space-y-1 text-[14px]'>
              {rows.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export default DaySummaryCard;
