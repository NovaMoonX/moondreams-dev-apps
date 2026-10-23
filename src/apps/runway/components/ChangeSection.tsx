import { use } from 'react';

import EffectPreview from '@apps/runway/components/EffectPreview';
import FromWhenPicker from '@apps/runway/components/FromWhenPicker';
import { ChangeFlowContext } from '@apps/runway/forms/changeFlowContext';

/** What an edit adds under its form: when it starts and what it does to each upcoming income day. */
function ChangeSection() {
  const value = use(ChangeFlowContext);
  if (!value) return null;
  const { flow, kind } = value;

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
      <EffectPreview changeJson={flow.changeJson} />
    </div>
  );
}

export default ChangeSection;
