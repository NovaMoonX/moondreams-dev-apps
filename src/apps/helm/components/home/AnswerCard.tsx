import AnswerSources from '@apps/helm/components/home/AnswerSources';
import GeneralKnowledgeCard from '@apps/helm/components/home/GeneralKnowledgeCard';
import { HELM_COPY } from '@apps/helm/constants';
import type { CaptureAnswer } from '@apps/helm/types';

interface AnswerCardProps {
  answer: CaptureAnswer;
  /** Home draws it under the assistant's line, so it lines up with the words; a sheet has no inset. */
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
          {fromRecords !== null && <AnswerSources sources={answer.sources} />}
        </section>
      )}
      {general !== null && (
        <GeneralKnowledgeCard text={general} isHealth={answer.isHealth} />
      )}
    </div>
  );
}

export default AnswerCard;
