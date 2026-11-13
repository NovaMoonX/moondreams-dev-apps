import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import SectionDivider from '@/components/SectionDivider';
import AddRow from '@apps/helm/components/who/AddRow';
import KeyDateSheet from '@apps/helm/components/who/KeyDateSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { useKeyDates, type WhoKeyDate } from '@apps/helm/hooks/useKeyDates';
import type { OpenWho } from '@apps/helm/types';
import { formatKeyDateRow } from '@apps/helm/utils/keyDateText';

interface KeyDatesListProps {
  who: OpenWho;
}

const toHint = (date: WhoKeyDate) =>
  date.day === null
    ? `${HELM_COPY.keyDateDayUnknown} · ${HELM_COPY.keyDateAddDay}`
    : date.year === null
      ? `${HELM_COPY.keyDateYearUnknown} · ${HELM_COPY.keyDateAddYear}`
      : null;

/** The dates that come back for one who, each opening its sheet, with "Add a date" in the header. Read from the index alone. */
function KeyDatesList({ who }: KeyDatesListProps) {
  const { dates, isLoaded, isFailed } = useKeyDates(who.id);
  const [openId, setOpenId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const isEmpty = dates.length === 0 && isLoaded && !isFailed;

  return (
    <section className='space-y-3'>
      {isEmpty ? (
        <AddRow
          label={HELM_COPY.keyDateAddRow}
          onClick={() => setIsAdding(true)}
        />
      ) : (
        <SectionDivider
          label={HELM_COPY.keyDatesHeading}
          trailing={
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className="relative whitespace-nowrap after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-['']"
              onClick={() => setIsAdding(true)}
            >
              {HELM_COPY.keyDateAdd}
            </Button>
          }
        />
      )}
      {isEmpty ? null : dates.length === 0 ? (
        isFailed && (
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {HELM_COPY.keyDatesUnreadable}
          </p>
        )
      ) : (
        <ul className='helm-card divide-border divide-y overflow-hidden'>
          {dates.map((date) => {
            const hint = toHint(date);
            return (
              <li key={date.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  className='flex h-auto w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
                  onClick={() => setOpenId(date.id)}
                >
                  <span className='min-w-0 flex-1'>
                    <span className='text-foreground block text-[15px] leading-[21px] break-words'>
                      {formatKeyDateRow(date, date.occurrence)}
                    </span>
                    {hint && (
                      <span className='text-muted-foreground block text-[13px] break-words'>
                        {hint}
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    className='text-muted-foreground size-4 shrink-0'
                    aria-hidden='true'
                  />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <KeyDateSheet
        who={who}
        openId={openId}
        isAdding={isAdding}
        onClose={() => {
          setOpenId(null);
          setIsAdding(false);
        }}
      />
    </section>
  );
}

export default KeyDatesList;
