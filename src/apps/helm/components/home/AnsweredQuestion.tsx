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

/** The line a question keeps once it is answered: a question answered as a turn keeps its own words, since the answer follows as the person's message; any other says what was picked ("You picked Snow chains and Sunscreen"). */
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
      {question.builtBy === 'model'
        ? question.prompt
        : describeYourAnswer(question, answer, recordName)}
    </p>
  );
}

export default AnsweredQuestion;
