import ExternalLinkText from '@/components/ExternalLinkText';
import { HELM_COPY } from '@apps/helm/constants';
import type { AnswerQuote } from '@apps/helm/types';
import { formatQuoteDay } from '@apps/helm/utils/quoteDay';

/** One quote an answer kept from the person's mail or documents: where it is from, the words, and the way to the original. */
function QuoteLine({ quote }: { quote: AnswerQuote }) {
  if (quote.deletedAt !== null || quote.text === null) {
    return (
      <p className='text-muted-foreground text-[13px]'>
        {quote.connectorId === 'google:drive'
          ? HELM_COPY.quoteDocumentDisconnected
          : HELM_COPY.quoteDisconnected}
      </p>
    );
  }
  const link = quote.deepLink?.startsWith('https://') ? quote.deepLink : null;
  return (
    <div className='border-muted-foreground/40 flex flex-col gap-1.5 border-l-2 pl-3'>
      <p className='text-muted-foreground text-[13px] text-pretty break-words'>
        {HELM_COPY.quoteFrom(
          quote.sourceLabel,
          quote.at === null ? null : formatQuoteDay(quote.at, false),
        )}
      </p>
      <blockquote className='text-[15px] leading-[21px] break-words whitespace-pre-wrap'>
        {`“${quote.text}”`}
      </blockquote>
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
