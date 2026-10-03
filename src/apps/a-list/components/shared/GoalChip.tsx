import { Badge } from '@moondreamsdev/dreamer-ui/components';

interface GoalChipProps {
  label: string;
  goal: number | null;
  isMet: boolean;
}

/** A goal is the member's own target, so no goal means no chip. */
function GoalChip({ label, goal, isMet }: GoalChipProps) {
  if (goal === null) {
    return null;
  }

  return (
    <Badge variant={isMet ? 'success' : 'muted'} size='sm'>
      🎯 {label}: {isMet ? 'met' : 'not yet'}
    </Badge>
  );
}

export default GoalChip;
