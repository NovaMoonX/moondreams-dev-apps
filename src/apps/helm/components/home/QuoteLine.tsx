import ExternalLinkText from '@/components/ExternalLinkText';
import { HELM_COPY } from '@apps/helm/constants';
import type { AnswerQuote } from '@apps/helm/types';

const QUOTE_DAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

/** The day with no-break spaces, so "Sun, Nov 8" never splits across lines. */
const formatQuoteDay = (at: number) => QUOTE_DAY.format(at).replace(/ /g, ' ');

/** One quote an answer kept from the person's mail: who it was from, the words, and the way to the email. */
function QuoteLine({ quote }: { quote: AnswerQuote }) {
  if (quote.deletedAt !== null || quote.text === null) {
    return (
      <p className='text-muted-foreground py-2.5 text-[13px]'>
        {HELM_COPY.quoteDisconnected}
      </p>
    );
  }
  const link = quote.deepLink?.startsWith('https://') ? quote.deepLink : null;
  return (
    <div className='flex flex-col gap-1.5 py-2.5'>
      <p className='text-muted-foreground text-[13px] break-words'>
        {HELM_COPY.quoteFrom(
          quote.sourceLabel,
          quote.at === null ? null : formatQuoteDay(quote.at),
        )}
      </p>
      <blockquote className='border-border border-l-2 pl-3 text-[15px] leading-[21px] break-words whitespace-pre-wrap'>
        {`“${quote.text}”`}
      </blockquote>
      {link && (
        <ExternalLinkText
          href={link}
          label={HELM_COPY.quoteOpen}
          className='relative text-[13px] after:absolute after:inset-x-0 after:-inset-y-3'
        />
      )}
    </div>
  );
}

export default QuoteLine;
