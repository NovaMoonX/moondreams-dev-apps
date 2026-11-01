import { use } from 'react';

import { useAppSelector } from '@/store';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import EffectPreview from '@apps/runway/components/EffectPreview';
import FromWhenPicker from '@apps/runway/components/FromWhenPicker';
import { ChangeFlowContext } from '@apps/runway/forms/changeFlowContext';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import {
  selectAllCards,
  selectPairedBy,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getCardNamer } from '@apps/runway/utils/cardText';
import type { FundingRule } from '@apps/runway/types';
import { describeReplaced } from '@apps/runway/utils/changeText';
import { describePairedBy } from '@apps/runway/utils/fundingText';

/** What an edit adds under its form: when it starts and what it does to each upcoming income day. */
function ChangeSection({ isIdleShown = false }: { isIdleShown?: boolean }) {
  const value = use(ChangeFlowContext);
  const today = todayAsUtcDate();
  const pairedBy = useAppSelector((state) => selectPairedBy(state, today));
  const allCards = useAppSelector(selectAllCards);
  const mask = useMaskedText();
  if (!value || value.flow.isMoneyless) return null;
  if (value.flow.isUnchanged && !isIdleShown) return null;
  const { flow, kind, itemId } = value;
  const { setWarningBox } = flow;
  const pairedText = describePairedBy(
    pairedBy[itemId] ?? [],
    flow.candidate !== null && 'funding' in flow.candidate
      ? (flow.candidate.funding as FundingRule)
      : undefined,
  );
  const replacedText = describeReplaced(flow.replaced, getCardNamer(allCards));

  return (
    <div ref={setWarningBox} className='space-y-3'>
      <FromWhenPicker
        value={flow.from}
        onChange={flow.setFrom}
        today={flow.today}
        days={flow.days}
        kind={kind}
        presetDayKey={flow.presetDayKey}
      />
      {replacedText && (
        <p className='text-muted-foreground text-sm text-pretty'>
          {mask(replacedText)}
        </p>
      )}
      {!flow.isUnchanged && (
        <EffectPreview
          isCompact
          changeJson={flow.changeJson}
          emptyText={pairedText ?? undefined}
          holds={flow.holds}
        />
      )}
    </div>
  );
}

export default ChangeSection;
