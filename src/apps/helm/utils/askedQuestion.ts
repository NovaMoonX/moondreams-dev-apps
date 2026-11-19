import type { RootState } from '@/store';
import { isAnswerInFlight } from '@apps/helm/store/actions/questionActions';
import { selectAllCaptures } from '@apps/helm/store/selectors/captureSelectors';
import type { OpenCapture } from '@apps/helm/types';
import { getOpenQuestions } from '@apps/helm/utils/heldCaptures';
import { createSettledReader } from '@apps/helm/utils/linearThread';
import {
  pickQuestionTurn,
  type AnswerRoute,
} from '@apps/helm/utils/openQuestion';
import { pickComposerTarget } from '@apps/helm/utils/questionAnswers';
import { getFreshFrom, getOpenSessionId } from '@apps/helm/utils/sessions';

/** The first open, unskipped question (of a kind, when given) of the turn an answer goes to, with that turn. A typed answer goes to the newest turn of the session with a question that takes typed words, and to that question, so a question no field shows is never left without a way to answer. */
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
  const session = all.filter((capture) => capture.sessionId === sessionId);
  const isSettled = createSettledReader(all);
  const openOf = (turn: OpenCapture) =>
    turn.status !== 'needsYou'
      ? []
      : getOpenQuestions(turn)
          .filter(
            (entry) =>
              entry.skippedAt === null &&
              !isSettled(turn, entry.id) &&
              !isAnswerInFlight(turn.id, entry.id),
          )
          .map((entry) => ({ captureId: turn.id, ...entry }));
  if (route === 'typed' && kind === null) {
    const turn = session
      .filter((entry) => entry.answersQuestion === null)
      .reverse()
      .find((entry) => pickComposerTarget(openOf(entry)) !== undefined);
    const asked = turn && pickComposerTarget(openOf(turn));
    return turn && asked ? { latest: turn, asked } : null;
  }
  const latest = pickQuestionTurn(session, route, now);
  if (!latest) return null;
  const asked = openOf(latest).find(
    (entry) => kind === null || entry.question.kind === kind,
  );
  return asked ? { latest, asked } : null;
}
