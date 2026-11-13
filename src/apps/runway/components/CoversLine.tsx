import HelpTip from '@/components/HelpTip';
import { formatCents } from '@/utils/moneyUtils';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { HORIZON_WORDS } from '@apps/runway/constants';
import type { HorizonPlan } from '@apps/runway/engine/horizon';
import type { Cents, HorizonCost, Stance } from '@apps/runway/types';
import { readCovers } from '@apps/runway/utils/coversText';

/** Where the rest comes from: a short phrase drawn on the line (or none) and the full sentence behind its info icon. */
export interface CoversRest {
  short: string | null;
  note: string;
}

interface CoversLineProps {
  plan: HorizonPlan;
  costs: readonly HorizonCost[];
  /** What the item holds now. */
  heldCents: Cents;
  stance: Stance;
  /** Money was set aside and none of it is left. */
  isSetAsideUsed?: boolean;
  rest?: CoversRest | null;
}

/** What the money set aside pays for, in due order ("Covers Movers on Jan 15th at the high end."), with the other end of a range and where the rest comes from behind a help icon. */
function CoversLine({
  plan,
  costs,
  heldCents,
  stance,
  isSetAsideUsed = false,
  rest = null,
}: CoversLineProps) {
  const words = HORIZON_WORDS.covers;
  const { text, ranged, endWords } = readCovers(
    plan,
    costs,
    heldCents,
    stance,
    isSetAsideUsed,
  );
  const rangeNotes = ranged.map(({ cost }) =>
    words.helpRange(
      cost.name,
      formatCents(cost.amount.lowCents),
      formatCents(cost.amount.highCents),
      endWords,
    ),
  );
  const notes = [...rangeNotes, ...(rest ? [rest.note] : [])];
  const getTitle = () => {
    if (rangeNotes.length === 0) return HORIZON_WORDS.restHelpTitle;
    return rest ? words.helpBothTitle : words.helpTitle;
  };
  const line = [text, rest?.short ? `${rest.short}.` : null]
    .filter(Boolean)
    .join(' ');
  if (line === '') return null;

  const cut = line.lastIndexOf(' ') + 1;

  return (
    <p className='text-sm text-pretty'>
      <MaskedText>{line.slice(0, cut)}</MaskedText>
      <span className='whitespace-nowrap'>
        <MaskedText>{line.slice(cut)}</MaskedText>
        {notes.length > 0 && (
          <span className='ml-1 inline-block align-middle'>
            <HelpTip title={getTitle()}>
              <MaskedText>{notes.join(' ')}</MaskedText>
            </HelpTip>
          </span>
        )}
      </span>
    </p>
  );
}

export default CoversLine;
