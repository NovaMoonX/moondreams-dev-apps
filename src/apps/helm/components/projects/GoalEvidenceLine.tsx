import { useAppSelector } from '@/store';
import { useGoalEvidence } from '@apps/helm/hooks/useGoalEvidence';
import { selectGoalHabits } from '@apps/helm/store/selectors/habitSelectors';

/** A goal's showing-up line, muted; a goal with habits and no line yet keeps the line's height so rows don't jump. */
function GoalEvidenceLine({ projectId }: { projectId: string }) {
  const evidence = useGoalEvidence(projectId);
  const hasHabits = useAppSelector(
    (state) => selectGoalHabits(state, projectId).length > 0,
  );
  if (evidence) {
    return (
      <span className='text-muted-foreground line-clamp-1 text-[13px] leading-[18px]'>
        {evidence}
      </span>
    );
  }
  return hasHabits ? <span className='block min-h-[18px]' /> : null;
}

export default GoalEvidenceLine;
