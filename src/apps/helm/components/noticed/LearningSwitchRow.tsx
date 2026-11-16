import { Sparkles } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import SettingsRow from '@/components/SettingsRow';
import { useLearningSwitch } from '@apps/helm/components/noticed/useLearningSwitch';
import { HELM_COPY } from '@apps/helm/constants';

/** The switch as a settings row, for the top of What I've noticed. */
function LearningSwitchRow() {
  const { isOn, change } = useLearningSwitch();
  return (
    <SettingsRow
      icon={<Sparkles className='size-5' aria-hidden='true' />}
      title={HELM_COPY.learningTitle}
      description={isOn ? HELM_COPY.learningRowOn : HELM_COPY.learningRowOff}
      control={
        <AppToggle
          aria-label={HELM_COPY.learningTitle}
          checked={isOn}
          onCheckedChange={change}
        />
      }
    />
  );
}

export default LearningSwitchRow;
