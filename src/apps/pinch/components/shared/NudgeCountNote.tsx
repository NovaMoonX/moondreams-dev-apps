import { useAppSelector } from '@/store';
import { selectDismissedNudges } from '@apps/pinch/store/selectors';
import type { Gap } from '@apps/pinch/types';
import {
  countLeftOutIngredients,
  countUnaskedIngredients,
  withoutDismissed,
} from '@apps/pinch/utils/gaps';

interface NudgeCountNoteProps {
  /** Every ingredient the total leaves out. */
  leftOut: Gap[];
  /** The ones the note beside the total can still ask about, before the person's hidden ones are taken off. */
  open: Gap[];
}

/** Why the note beside a total counts fewer ingredients than the warning does, said only while the note is showing. */
function NudgeCountNote({ leftOut, open }: NudgeCountNoteProps) {
  const dismissed = useAppSelector(selectDismissedNudges);
  const isNoteShowing =
    countLeftOutIngredients(withoutDismissed(open, dismissed)) > 0;
  const unaskedCount = countUnaskedIngredients(leftOut, open, dismissed);

  if (!isNoteShowing || unaskedCount === 0) {
    return null;
  }

  return (
    <p className='text-muted-foreground'>
      The note asks about fewer:{' '}
      {unaskedCount === 1 ? 'one is' : `${unaskedCount} are`} hidden or in a day
      that has passed.
    </p>
  );
}

export default NudgeCountNote;
