import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import ExternalLinkText from '@/components/ExternalLinkText';
import { afterBackLayersClose } from '@/hooks/useBackHistory';
import { readConnectorAppId } from '@/lib/connections/contract';
import { HELM_COPY } from '@apps/helm/constants';
import { useSourceAppName } from '@apps/helm/hooks/useSourceAppName';
import type { AnswerQuote } from '@apps/helm/types';

const QUOTE_DAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const QUOTE_UTC_DAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** The day with no-break spaces, so "Sun, Nov 8" never splits across lines; an app's date-only day is read in UTC. */
const formatQuoteDay = (at: number, isDateOnly: boolean) =>
  (isDateOnly ? QUOTE_UTC_DAY : QUOTE_DAY).format(at).replace(/ /g, ' ');

/** One quote an answer kept from the person's mail or documents: where it is from, the words, and the way to the original. */
function QuoteLine({ quote }: { quote: AnswerQuote }) {
  const navigate = useNavigate();
  const { nameOf } = useSourceAppName();
  const isApp = readConnectorAppId(quote.connectorId) !== null;
  if (quote.deletedAt !== null || quote.text === null) {
    return (
      <p className='text-muted-foreground py-2.5 text-[13px]'>
        {isApp
          ? HELM_COPY.quoteRecordDisconnected
          : quote.connectorId === 'google:drive'
            ? HELM_COPY.quoteDocumentDisconnected
            : HELM_COPY.quoteDisconnected}
      </p>
    );
  }
  const link = quote.deepLink?.startsWith('https://') ? quote.deepLink : null;
  const route =
    isApp && quote.deepLink?.startsWith('/') && !quote.deepLink.startsWith('//')
      ? quote.deepLink
      : null;
  return (
    <div className='border-muted-foreground/40 my-2.5 flex flex-col gap-1.5 border-l-2 pl-3'>
      <p className='text-muted-foreground text-[13px] text-pretty break-words'>
        {HELM_COPY.quoteFrom(
          quote.sourceLabel,
          quote.at === null ? null : formatQuoteDay(quote.at, isApp),
        )}
      </p>
      <blockquote className='text-[15px] leading-[21px] break-words whitespace-pre-wrap'>
        {`“${quote.text}”`}
      </blockquote>
      {route && (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          className='relative self-start after:absolute after:inset-x-0 after:-inset-y-1.5'
          onClick={() => afterBackLayersClose(() => navigate(route))}
        >
          {HELM_COPY.syncedOpenIn(nameOf(quote.connectorId))}
          <ChevronRight className='ml-0.5 size-3.5' aria-hidden='true' />
        </Button>
      )}
      {link && (
        <ExternalLinkText
          href={link}
          label={
            quote.connectorId === 'google:drive'
              ? HELM_COPY.quoteOpenDrive
              : HELM_COPY.quoteOpen
          }
          className='relative text-[13px] after:absolute after:inset-x-0 after:-inset-y-3'
        />
      )}
    </div>
  );
}

export default QuoteLine;
