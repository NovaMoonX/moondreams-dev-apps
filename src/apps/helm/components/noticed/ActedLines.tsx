import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import AssistantLine from '@apps/helm/components/activity/AssistantLine';
import { usePatternAnswers } from '@apps/helm/components/noticed/usePatternAnswers';
import { HELM_COPY } from '@apps/helm/constants';
import {
  selectActedPatterns,
  selectIsLearningOn,
} from '@apps/helm/store/selectors/patternSelectors';
import { formatDayName } from '@apps/helm/utils/planDays';

interface ActedLinesProps {
  dayKey: string;
  todayKey: string;
}

/** What the assistant did on its own to its own plans for this day ("Today's evening left empty"), told where the day shows, with Undo on the same line. */
function ActedLines({ dayKey, todayKey }: ActedLinesProps) {
  const acted = useAppSelector(selectActedPatterns);
  const isLearningOn = useAppSelector(selectIsLearningOn);
  const answers = usePatternAnswers();
  const weekday = new Date(Date.parse(dayKey)).getUTCDay();
  const named = formatDayName(dayKey, todayKey);
  const dayName = named.charAt(0).toUpperCase() + named.slice(1);
  const lines = acted.flatMap((pattern) =>
    isLearningOn &&
    pattern.effect.kind === 'plannerAvoid' &&
    pattern.effect.bucket.kind === 'weekdayPart' &&
    pattern.effect.bucket.weekday === weekday
      ? [{ pattern, part: pattern.effect.bucket.part }]
      : [],
  );
  if (lines.length === 0) return null;
  return (
    <div className='space-y-2'>
      {lines.map(({ pattern, part }) => (
        <AssistantLine key={pattern.id}>
          {HELM_COPY.noticedActedLine(
            dayName,
            HELM_COPY.patternPartSingular[part],
          )}
          {' · '}
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className="relative -my-1 px-1! align-baseline after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']"
            disabled={answers.busyId !== null}
            onClick={() => void answers.takeBack(pattern)}
          >
            {HELM_COPY.undo}
          </Button>
        </AssistantLine>
      ))}
    </div>
  );
}

export default ActedLines;
