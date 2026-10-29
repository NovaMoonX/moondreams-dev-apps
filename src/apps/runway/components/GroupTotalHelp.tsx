import { RangeBasisNote } from '@apps/runway/components/RangeNote';
import { GROUP_WORDS } from '@apps/runway/constants';
import type { GroupTotal } from '@apps/runway/engine/groups';
import type { Stance } from '@apps/runway/types';

interface GroupTotalHelpProps {
  total: GroupTotal;
  /** The total is a range and amounts are showing. */
  hasRange: boolean;
  stance: Stance;
}

/** What a group's total counts and leaves out, the same words on its heading and in its sheet. */
function GroupTotalHelp({ total, hasRange, stance }: GroupTotalHelpProps) {
  return (
    <>
      <p>{GROUP_WORDS.basis}</p>
      {total.uncounted > 0 && <p>{GROUP_WORDS.uncounted(total.uncounted)}</p>}
      {hasRange && (
        <>
          <p>{GROUP_WORDS.rangeTotal}</p>
          <RangeBasisNote stance={stance} side='expense' />
        </>
      )}
    </>
  );
}

export default GroupTotalHelp;
