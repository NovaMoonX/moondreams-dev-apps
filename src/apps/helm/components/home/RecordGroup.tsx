import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import ShowMoreButton from '@/components/ShowMoreButton';
import { afterBackLayersClose } from '@/hooks/useBackHistory';
import { HELM_COPY } from '@apps/helm/constants';
import { useSourceAppName } from '@apps/helm/hooks/useSourceAppName';
import type { AnswerQuote } from '@apps/helm/types';
import { formatQuoteDay } from '@apps/helm/utils/quoteDay';

const FOLDED_COUNT = 3;

/** The records an answer read from one app: its name, a row per record, and one way into the app. */
function RecordGroup({ quotes }: { quotes: AnswerQuote[] }) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const { nameOf } = useSourceAppName();
  const live = quotes.filter(
    (quote) => quote.deletedAt === null && quote.record !== null,
  );
  const shown = isOpen ? live : live.slice(0, FOLDED_COUNT);
  const hasGone = live.length < quotes.length;
  const route =
    live
      .map((quote) => quote.deepLink)
      .find((link) => link?.startsWith('/') && !link.startsWith('//')) ?? null;
  const appName = nameOf(quotes[0].connectorId);
  return (
    <div className='flex flex-col gap-1.5'>
      {live.length > 0 && (
        <div className='flex min-h-7 items-center justify-between gap-3'>
          <p className='text-muted-foreground text-[13px] font-medium'>
            {HELM_COPY.syncedFrom(appName)}
          </p>
          {route && (
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              aria-label={HELM_COPY.syncedOpenIn(appName)}
              className='relative -mr-2 shrink-0 after:absolute after:inset-x-0 after:-inset-y-1.5'
              onClick={() => afterBackLayersClose(() => navigate(route))}
            >
              {HELM_COPY.recordGroupOpen}
              <ChevronRight className='ml-0.5 size-3.5' aria-hidden='true' />
            </Button>
          )}
        </div>
      )}
      {live.length > 0 && (
        <ul className='flex flex-col gap-2.5'>
          {shown.map(({ id, record, at }) => (
            <li key={id} className='flex items-baseline justify-between gap-3'>
              <span className='min-w-0'>
                <span className='block text-[15px] leading-[21px] break-words'>
                  {record?.name}
                </span>
                <span className='text-muted-foreground block text-[13px] break-words'>
                  {[
                    record?.detail,
                    at === null ? null : formatQuoteDay(at, true),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span className='shrink-0 text-[15px] leading-[21px] tabular-nums'>
                {record?.amount}
              </span>
            </li>
          ))}
        </ul>
      )}
      {live.length > FOLDED_COUNT && (
        <ShowMoreButton
          isOpen={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen
            ? HELM_COPY.answerShowFewer
            : HELM_COPY.answerShowMore(live.length - FOLDED_COUNT)}
        </ShowMoreButton>
      )}
      {hasGone && (
        <p className='text-muted-foreground text-[13px]'>
          {HELM_COPY.quoteRecordDisconnected}
        </p>
      )}
    </div>
  );
}

export default RecordGroup;
