import { useState } from 'react';

import { Eye, History } from 'lucide-react';

import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import WhatTheAiSees from '@apps/helm/components/settings/WhatTheAiSees';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';

interface SettingsScreenProps {
  onBack: () => void;
  onOpenActivity: () => void;
}

/** A utility screen: Back to Home, its title and its groups, with no ask bar. */
function SettingsScreen({ onBack, onOpenActivity }: SettingsScreenProps) {
  const [isSeesOpen, setIsSeesOpen] = useState(false);

  return (
    <>
      <main className='flex flex-1 flex-col gap-6'>
        <HelmHeader
          backLabel='Home'
          onBack={onBack}
          onHome={onBack}
          showsHome={false}
        />
        <h1 className='helm-serif text-[28px] leading-[34px]'>
          {HELM_COPY.settingsTitle}
        </h1>
        <SettingsGroup title={HELM_COPY.settingsYourData}>
          <SettingsRow
            icon={<History className='size-5' aria-hidden='true' />}
            title={HELM_COPY.activityTitle}
            description={HELM_COPY.activityRowHint}
            onClick={onOpenActivity}
            hasChevron
          />
          <SettingsRow
            icon={<Eye className='size-5' aria-hidden='true' />}
            title={HELM_COPY.whatTheAiSees}
            description={HELM_COPY.whatTheAiSeesRowHint}
            onClick={() => setIsSeesOpen(true)}
            hasChevron
          />
        </SettingsGroup>
      </main>
      <WhatTheAiSees isOpen={isSeesOpen} onClose={() => setIsSeesOpen(false)} />
    </>
  );
}

export default SettingsScreen;
