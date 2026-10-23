import { use } from 'react';

import EffectPreview from '@apps/runway/components/EffectPreview';
import FromWhenPicker from '@apps/runway/components/FromWhenPicker';
import { ChangeFlowContext } from '@apps/runway/forms/changeFlowContext';

/** What an edit adds under its form: when it starts and what it does to each upcoming income day. */
function ChangeSection() {
  const value = use(ChangeFlowContext);
  if (!value) return null;
  const { flow, itemId, kind, candidate } = value;

  return (
    <div className='space-y-4 pt-2'>
      <FromWhenPicker
        value={flow.from}
        onChange={flow.setFrom}
        today={flow.today}
      />
      <EffectPreview
        itemId={itemId}
        kind={kind}
        payload={candidate}
        effectiveFrom={flow.effectiveFrom}
      />
    </div>
  );
}

export default ChangeSection;
