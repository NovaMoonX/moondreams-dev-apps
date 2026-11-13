import AnswerSources from '@apps/helm/components/home/AnswerSources';
import QuoteLine from '@apps/helm/components/home/QuoteLine';
import RecordGroup from '@apps/helm/components/home/RecordGroup';
import SearchedLine from '@apps/helm/components/home/SearchedLine';
import GeneralKnowledgeCard from '@apps/helm/components/home/GeneralKnowledgeCard';
import SaveToKnowledge from '@apps/helm/components/home/SaveToKnowledge';
import { HELM_COPY } from '@apps/helm/constants';
import { readConnectorAppId } from '@/lib/connections/contract';
import type { AnswerQuote, CaptureAnswer } from '@apps/helm/types';

interface AnswerCardProps {
  answer: CaptureAnswer;
  /** Set under a line of words it lines up with; only then do its sources open, since a sheet can't open a sheet. */
  isInset?: boolean;
  /** The turn this answer belongs to; with it the general part can be saved as a note. */
  capture?: { id: string; answerSavedNoteId: string | null };
}

/** An answer in its two kinds of words: what the person's records say, then general knowledge under its label. */
function AnswerCard({ answer, isInset = false, capture }: AnswerCardProps) {
  const { fromRecords, general, scope } = answer;
  const recordsText =
    fromRecords ??
    (scope === 'both' && answer.searched.length === 0
      ? null
      : HELM_COPY.answerNothingInRecords);
  const quotes = fromRecords === null ? [] : answer.quotes;
  const appGroups = quotes
    .filter((quote) => readConnectorAppId(quote.connectorId) !== null)
    .reduce(
      (groups, quote) =>
        groups.set(quote.connectorId, [
          ...(groups.get(quote.connectorId) ?? []),
          quote,
        ]),
      new Map<string, AnswerQuote[]>(),
    );
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
          {(quotes.length > 0 || answer.searched.length > 0) && (
            <div className='flex flex-col gap-3.5 pt-1'>
              {quotes
                .filter(
                  (quote) => readConnectorAppId(quote.connectorId) === null,
                )
                .map((quote) => (
                  <QuoteLine key={quote.id} quote={quote} />
                ))}
              {[...appGroups].map(([connectorId, group]) => (
                <RecordGroup key={connectorId} quotes={group} />
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
        <GeneralKnowledgeCard
          text={general}
          isHealth={answer.isHealth}
          differs={answer.generalDiffersFrom}
        >
          {capture && (
            <SaveToKnowledge
              captureId={capture.id}
              savedNoteId={capture.answerSavedNoteId}
              answer={answer}
            />
          )}
        </GeneralKnowledgeCard>
      )}
    </div>
  );
}

export default AnswerCard;
