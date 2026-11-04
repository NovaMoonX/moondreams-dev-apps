import HelpTip from '@/components/HelpTip';
import { formatCents } from '@/utils/moneyUtils';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { HORIZON_WORDS } from '@apps/runway/constants';
import type { HorizonPlan } from '@apps/runway/engine/horizon';
import type { Cents, HorizonCost, Stance } from '@apps/runway/types';
import { readCovers } from '@apps/runway/utils/coversText';

interface CoversLineProps {
  plan: HorizonPlan;
  costs: readonly HorizonCost[];
  /** What the item holds now. */
  heldCents: Cents;
  stance: Stance;
  /** A sentence that follows in the same paragraph, such as where the rest comes from. */
  after?: string | null;
}

/** What the money set aside pays for, in due order ("Covers Movers on Jan 15th at the high end."), with the other end of a range behind a help icon. */
function CoversLine({
  plan,
  costs,
  heldCents,
  stance,
  after = null,
}: CoversLineProps) {
  const words = HORIZON_WORDS.covers;
  const { text, ranged, endWords } = readCovers(plan, costs, heldCents, stance);
  if (text === null)
    return after === null ? null : (
      <p className='text-sm text-pretty'>{after}</p>
    );

  const cut = text.lastIndexOf(' ') + 1;

  return (
    <p className='text-sm text-pretty'>
      <MaskedText>{text.slice(0, cut)}</MaskedText>
      <span className='whitespace-nowrap'>
        <MaskedText>{text.slice(cut)}</MaskedText>
        {ranged.length > 0 && (
          <span className='ml-1 inline-block align-middle'>
            <HelpTip title={words.helpTitle}>
              <MaskedText>
                {ranged
                  .map(({ cost }) =>
                    words.helpRange(
                      cost.name,
                      formatCents(cost.amount.lowCents),
                      formatCents(cost.amount.highCents),
                      endWords,
                    ),
                  )
                  .join(' ')}
              </MaskedText>
            </HelpTip>
          </span>
        )}
      </span>
      {after !== null && ` ${after}`}
    </p>
  );
}

export default CoversLine;
