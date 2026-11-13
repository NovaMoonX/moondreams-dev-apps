import { useAppSelector } from '@/store';
import {
  selectPlacesById,
  selectWhoById,
} from '@apps/helm/store/selectors/whoSelectors';
import type { HelmQuestion, QuestionAnswer } from '@apps/helm/types';
import { describeYourAnswer } from '@apps/helm/utils/questionAnswers';

interface AnsweredQuestionProps {
  question: HelmQuestion;
  answer: QuestionAnswer;
}

/** The line a question keeps once it is answered ("You picked Snow chains and Sunscreen"); the answer turn's own card follows in the thread. */
function AnsweredQuestion({ question, answer }: AnsweredQuestionProps) {
  const who = useAppSelector(selectWhoById);
  const places = useAppSelector(selectPlacesById);
  const recordName =
    answer.shape === 'pickRecord' && answer.ref
      ? ((answer.ref.collection === 'who'
          ? who.get(answer.ref.id)?.name
          : places.get(answer.ref.id)?.name) ?? null)
      : null;
  return (
    <p className='text-muted-foreground pl-[30px] text-[13px] text-pretty break-words'>
      {describeYourAnswer(question, answer, recordName)}
    </p>
  );
}

export default AnsweredQuestion;
