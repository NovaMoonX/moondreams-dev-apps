import type { RootState } from '@/store';
import { isAnswerInFlight } from '@apps/helm/store/actions/questionActions';
import { selectAllCaptures } from '@apps/helm/store/selectors/captureSelectors';
import { getOpenQuestions } from '@apps/helm/utils/heldCaptures';
import { createSettledReader } from '@apps/helm/utils/linearThread';
import {
  pickQuestionTurn,
  type AnswerRoute,
} from '@apps/helm/utils/openQuestion';
import { pickComposerTarget } from '@apps/helm/utils/questionAnswers';
import { getFreshFrom, getOpenSessionId } from '@apps/helm/utils/sessions';

/** The first open, unskipped question (of a kind, when given) of the turn an answer goes to, with that turn. A typed answer goes to the first question that takes typed words. */
export function readAskedQuestion(
  state: RootState,
  route: AnswerRoute,
  now: number,
  kind: string | null = null,
) {
  const all = selectAllCaptures(state);
  const sessionId = getOpenSessionId(
    all,
    now,
    getFreshFrom(state.helm.profile),
  );
  const latest = pickQuestionTurn(
    all.filter((capture) => capture.sessionId === sessionId),
    route,
    now,
  );
  if (!latest || latest.status !== 'needsYou') return null;
  const isSettled = createSettledReader(all);
  const open = getOpenQuestions(latest)
    .filter(
      (entry) =>
        entry.skippedAt === null &&
        !isSettled(latest, entry.id) &&
        !isAnswerInFlight(latest.id, entry.id),
    )
    .map((entry) => ({ captureId: latest.id, ...entry }));
  const asked =
    route === 'typed' && kind === null
      ? pickComposerTarget(open)
      : open.find((entry) => kind === null || entry.question.kind === kind);
  return asked ? { latest, asked } : null;
}
