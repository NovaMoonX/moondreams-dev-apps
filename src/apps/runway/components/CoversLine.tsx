import HelpTip from '@/components/HelpTip';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { HORIZON_WORDS, RANGE_END_WORDS } from '@apps/runway/constants';
import type { HorizonPlan } from '@apps/runway/engine/horizon';
import { getRangeEnd } from '@apps/runway/engine/stance';
import type { Cents, HorizonCost, Stance } from '@apps/runway/types';

const MAX_NAMED = 3;

const listFormat = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
});

interface CoversLineProps {
  plan: HorizonPlan;
  costs: readonly HorizonCost[];
  /** What the item holds now. */
  heldCents: Cents;
  stance: Stance;
}

/** What the money set aside pays for, in due order ("Covers Movers on Jan 15th at the high end."), with the other end of a range behind a help icon. */
function CoversLine({ plan, costs, heldCents, stance }: CoversLineProps) {
  const words = HORIZON_WORDS.covers;
  const covered = plan.covers.flatMap((cover) => {
    const cost = costs.find(({ id }) => id === cover.costId);
    return cost && cover.coveredCents >= cover.totalCents
      ? [{ cover, cost }]
      : [];
  });
  const ranged = covered.filter(
    ({ cost }) => cost.amount.lowCents !== cost.amount.highCents,
  );
  const endWords = RANGE_END_WORDS[getRangeEnd(stance, 'expense')];
  const named = covered
    .slice(0, MAX_NAMED)
    .map(({ cover, cost }) =>
      words.on(cost.name, formatDateOrdinalUTC(cover.dueOn)),
    );
  const getText = () => {
    if (plan.covers.length === 0) return null;
    if (heldCents <= 0) return plan.shortfall ? null : words.nothingSet;
    if (covered.length === 0) return plan.shortfall ? null : words.none;
    if (covered.length === plan.covers.length && covered.length > MAX_NAMED) {
      return words.all;
    }
    const list = listFormat.format(
      covered.length > MAX_NAMED
        ? [...named, words.more(covered.length - MAX_NAMED)]
        : named,
    );
    return words.listed(list, ranged.length > 0 ? words.atEnd(endWords) : '');
  };
  const text = getText();
  if (text === null) return null;

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
    </p>
  );
}

export default CoversLine;
