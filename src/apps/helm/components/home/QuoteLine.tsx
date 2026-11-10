import ExternalLinkText from '@/components/ExternalLinkText';
import { HELM_COPY } from '@apps/helm/constants';
import type { AnswerQuote } from '@apps/helm/types';

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
          quote.at === null
            ? null
            : new Date(quote.at).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              }),
        )}
      </p>
      <blockquote className='border-border border-l-2 pl-3 text-[15px] leading-[21px] break-words whitespace-pre-wrap'>
        {`“${quote.text}”`}
      </blockquote>
      {link && (
        <ExternalLinkText
          href={link}
          label={HELM_COPY.quoteOpen}
          className='text-[13px]'
        />
      )}
    </div>
  );
}

export default QuoteLine;
