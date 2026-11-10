import AnswerSources from '@apps/helm/components/home/AnswerSources';
import QuoteLine from '@apps/helm/components/home/QuoteLine';
import SearchedLine from '@apps/helm/components/home/SearchedLine';
import GeneralKnowledgeCard from '@apps/helm/components/home/GeneralKnowledgeCard';
import { HELM_COPY } from '@apps/helm/constants';
import type { CaptureAnswer } from '@apps/helm/types';

interface AnswerCardProps {
  answer: CaptureAnswer;
  /** Set under a line of words it lines up with; only then do its sources open, since a sheet can't open a sheet. */
  isInset?: boolean;
}

/** An answer in its two kinds of words: what the person's records say, then general knowledge under its label. */
function AnswerCard({ answer, isInset = false }: AnswerCardProps) {
  const { fromRecords, general, scope } = answer;
  const recordsText =
    fromRecords ?? (scope === 'both' ? null : HELM_COPY.answerNothingInRecords);
  return (
    <div
      className={
        isInset
          ? 'ml-[30px] flex w-[calc(100%-30px)] flex-col gap-3'
          : 'flex w-full flex-col gap-3'
      }
    >
      {recordsText !== null && (
        <section className='bg-secondary text-secondary-foreground rounded-[14px] px-3.5 py-3'>
          <p
            className={
              fromRecords === null
                ? 'text-[15px] leading-[21px] break-words'
                : 'pb-2 text-[15px] leading-[21px] break-words whitespace-pre-wrap'
            }
          >
            {recordsText}
          </p>
          {fromRecords !== null && (
            <AnswerSources sources={answer.sources} canOpen={isInset} />
          )}
          {fromRecords !== null &&
            (answer.quotes.length > 0 || answer.searched.length > 0) && (
              <div className='divide-border border-border flex flex-col divide-y border-t'>
                {answer.quotes.map((quote) => (
                  <QuoteLine key={quote.id} quote={quote} />
                ))}
                {answer.searched.map((searched) => (
                  <SearchedLine
                    key={`${searched.connectorId}|${searched.accountId}`}
                    searched={searched}
                    canReconnect={isInset}
                  />
                ))}
              </div>
            )}
        </section>
      )}
      {general !== null && (
        <GeneralKnowledgeCard text={general} isHealth={answer.isHealth} />
      )}
    </div>
  );
}

export default AnswerCard;
