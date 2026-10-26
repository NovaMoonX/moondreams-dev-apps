import { use } from 'react';

import { useAppSelector } from '@/store';
import { CHANGE_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import EffectPreview from '@apps/runway/components/EffectPreview';
import FromWhenPicker from '@apps/runway/components/FromWhenPicker';
import { ChangeFlowContext } from '@apps/runway/forms/changeFlowContext';
import { selectPairedBy } from '@apps/runway/store/selectors/runwaySelectors';
import { describePairedBy } from '@apps/runway/utils/fundingText';

/** What an edit adds under its form: when it starts and what it does to each upcoming income day. */
function ChangeSection() {
  const value = use(ChangeFlowContext);
  const today = todayAsUtcDate();
  const pairedBy = useAppSelector((state) => selectPairedBy(state, today));
  if (!value) return null;
  const { flow, kind, itemId } = value;
  const pairedText = describePairedBy(pairedBy[itemId] ?? []);

  return (
    <div className='space-y-4 pt-2'>
      <FromWhenPicker
        value={flow.from}
        onChange={flow.setFrom}
        today={flow.today}
        days={flow.days}
        kind={kind}
        presetDayKey={flow.presetDayKey}
      />
      <EffectPreview
        isCompact
        changeJson={flow.changeJson}
        emptyText={
          pairedText
            ? `${pairedText} Change the pairing under Plan, Income to move an income day.`
            : undefined
        }
        waitingText={
          flow.isUnchanged ? CHANGE_WORDS.previewUntouched : undefined
        }
      />
    </div>
  );
}

export default ChangeSection;
