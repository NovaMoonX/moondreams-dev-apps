import { MaskedText } from '@apps/runway/components/MaskedText';
import { RangeBasisNote } from '@apps/runway/components/RangeNote';
import { GROUP_WORDS } from '@apps/runway/constants';
import type { GroupTotal } from '@apps/runway/engine/groups';
import type { Stance } from '@apps/runway/types';

interface GroupTotalHelpProps {
  total: GroupTotal;
  /** The total is a range and amounts are showing. */
  hasRange: boolean;
  stance: Stance;
  /** What a heading counts when the group has the other kind too; the sheet counts both. */
  only?: {
    kind: 'bills' | 'envelopes';
    name: string;
    part: string | null;
    whole: string | null;
  };
}

/** What a group's total counts and leaves out, the same words on its heading and in its sheet. */
function GroupTotalHelp({
  total,
  hasRange,
  stance,
  only,
}: GroupTotalHelpProps) {
  return (
    <>
      {only && (
        <p>
          <MaskedText>
            {(only.kind === 'bills'
              ? GROUP_WORDS.onlyBills
              : GROUP_WORDS.onlyEnvelopes)(only.name, only.part, only.whole)}
          </MaskedText>
        </p>
      )}
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
