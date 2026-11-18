import { useAppSelector } from '@/store';
import QuestionCard from '@apps/helm/components/home/QuestionCard';
import {
  selectAllCaptures,
  selectHeldItems,
} from '@apps/helm/store/selectors/captureSelectors';
import { getOpenQuestions } from '@apps/helm/utils/heldCaptures';
import { readQuestionPlace } from '@apps/helm/utils/linearThread';

/** The questions the person asked to hear again, live at the bottom of the thread where the conversation is now; each keeps its own record, so answering it settles it where it was first asked. */
function ReaskedQuestions({ newestTurnAt }: { newestTurnAt: number | null }) {
  const captures = useAppSelector(selectAllCaptures);
  const held = useAppSelector(selectHeldItems);
  const known = new Map(
    [...captures, ...held.needsYou.map((item) => item.capture)].map(
      (capture) => [capture.id, capture],
    ),
  );
  const asked = [...known.values()]
    .flatMap((capture) =>
      getOpenQuestions(capture).flatMap((entry) => {
        const reaskedAt = capture.questionState[entry.id]?.reaskedAt ?? null;
        return reaskedAt !== null &&
          readQuestionPlace({
            turnAt: capture.createdAt,
            reaskedAt,
            newestTurnAt,
          }) === 'below'
          ? [{ capture, entry, reaskedAt }]
          : [];
      }),
    )
    .sort((a, b) => a.reaskedAt - b.reaskedAt);

  if (asked.length === 0) return null;

  return (
    <div className='flex w-full flex-col items-start gap-8'>
      {asked.map(({ capture, entry }) => (
        <QuestionCard
          key={`${capture.id}:${entry.id}`}
          captureId={capture.id}
          item={entry}
          isInSheet={false}
        />
      ))}
    </div>
  );
}

export default ReaskedQuestions;
