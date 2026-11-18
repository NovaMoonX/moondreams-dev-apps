import { useState } from 'react';

import { Sparkles } from 'lucide-react';

import SettingsRow from '@/components/SettingsRow';
import { useAppSelector } from '@/store';
import LearningSheet from '@apps/helm/components/settings/LearningSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { selectIsLearningOn } from '@apps/helm/store/selectors/patternSelectors';

/** The switch as a settings row that opens its sheet, so what the overnight reading does is always read before turning noticing on. */
function LearningSwitchRow() {
  const [isOpen, setIsOpen] = useState(false);
  const isOn = useAppSelector(selectIsLearningOn);
  return (
    <>
      <SettingsRow
        icon={<Sparkles className='size-5' aria-hidden='true' />}
        title={HELM_COPY.learningTitle}
        description={isOn ? HELM_COPY.learningRowOn : HELM_COPY.learningRowOff}
        onClick={() => setIsOpen(true)}
        hasChevron
      />
      <LearningSheet isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

export default LearningSwitchRow;
