import { useState } from 'react';

import { Eye, History, Link2, Mic, Sun } from 'lucide-react';

import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import VoiceSettings from '@apps/helm/components/voice/VoiceSettings';
import ShiftCalendars from '@apps/helm/components/settings/ShiftCalendars';
import WhatTheAiSees from '@apps/helm/components/settings/WhatTheAiSees';
import YourDaySheet from '@apps/helm/components/settings/YourDaySheet';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { useAppSelector } from '@/store';
import { useNow } from '@/hooks/useNow';
import { useConnections } from '@/lib/connections/useConnections';
import { HELM_COPY } from '@apps/helm/constants';
import { formatClockTime } from '@/utils/formatUtils';
import { formatUpdatedAt, getNewestOkAt } from '@apps/helm/utils/synced';

interface SettingsScreenProps {
  onBack: () => void;
  onOpenActivity: () => void;
  onOpenConnectedApps: () => void;
}

/** A utility screen: Back to Home, its title and its groups, with no ask bar. */
function SettingsScreen({
  onBack,
  onOpenActivity,
  onOpenConnectedApps,
}: SettingsScreenProps) {
  const [isSeesOpen, setIsSeesOpen] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isDayOpen, setIsDayOpen] = useState(false);
  const { grants: allGrants, isKnown } = useConnections({
    readerAppId: 'helm',
    includeEnded: true,
  });
  const grants = allGrants.filter((grant) => grant.status !== 'ended');
  const keptCount = allGrants.reduce(
    (total, grant) => total + (grant.keptCopies?.count ?? 0),
    0,
  );
  const now = useNow(60_000);
  const newestOkAt = grants.reduce<number | null>((newest, grant) => {
    const at = getNewestOkAt(grant);
    return at !== null && (newest === null || at > newest) ? at : newest;
  }, null);
  const voiceMode = useAppSelector((state) => state.helm.profile?.voiceMode);
  const profile = useAppSelector((state) => state.helm.profile);

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
        <SettingsGroup title={HELM_COPY.settingsPlanning}>
          <SettingsRow
            icon={<Sun className='size-5' aria-hidden='true' />}
            title={HELM_COPY.yourDayRow}
            description={
              profile
                ? HELM_COPY.yourDayLine(
                    formatClockTime(profile.dayStartTime),
                    formatClockTime(profile.dayEndTime),
                  )
                : undefined
            }
            onClick={() => setIsDayOpen(true)}
            hasChevron
          />
        </SettingsGroup>
        <SettingsGroup title={HELM_COPY.settingsConnections}>
          <SettingsRow
            icon={<Link2 className='size-5' aria-hidden='true' />}
            title={HELM_COPY.connectedAppsRowTitle}
            description={
              !isKnown
                ? undefined
                : grants.length > 0
                  ? newestOkAt === null
                    ? HELM_COPY.connectedAppsCount(grants.length)
                    : `${HELM_COPY.connectedAppsCount(grants.length)} · ${HELM_COPY.syncedUpdatedLine(formatUpdatedAt(newestOkAt, now))}`
                  : keptCount > 0
                    ? `${HELM_COPY.connectedAppsNone} · ${HELM_COPY.keptCountLine(keptCount)}`
                    : HELM_COPY.connectedAppsNone
            }
            onClick={onOpenConnectedApps}
            hasChevron
          />
          <ShiftCalendars onOpenConnectedApps={onOpenConnectedApps} />
        </SettingsGroup>
        <SettingsGroup title={HELM_COPY.settingsVoice}>
          <SettingsRow
            icon={<Mic className='size-5' aria-hidden='true' />}
            title={HELM_COPY.settingsVoiceRowTitle}
            description={
              voiceMode === 'deviceOnly'
                ? HELM_COPY.settingsVoiceDevice
                : HELM_COPY.settingsVoiceCloud
            }
            onClick={() => setIsVoiceOpen(true)}
            hasChevron
          />
        </SettingsGroup>
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
      <YourDaySheet isOpen={isDayOpen} onClose={() => setIsDayOpen(false)} />
      <VoiceSettings
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
      />
      <WhatTheAiSees isOpen={isSeesOpen} onClose={() => setIsSeesOpen(false)} />
    </>
  );
}

export default SettingsScreen;
