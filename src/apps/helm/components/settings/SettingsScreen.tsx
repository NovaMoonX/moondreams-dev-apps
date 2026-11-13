import { useState } from 'react';

import {
  Eye,
  History,
  Link2,
  Mic,
  Sparkles,
  Sun,
  UserRound,
} from 'lucide-react';

import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import {
  keepSignOutNote,
  SIGNED_OUT_EVERYWHERE_NOTE,
} from '@/lib/auth/signOutNote';
import { signOutEverywhere } from '@/lib/security/trustedBrowsers';
import ColoursSection from '@apps/helm/components/settings/ColoursSection';
import SettingsSection from '@apps/helm/components/settings/SettingsSection';
import TrustBrowserRow from '@/components/TrustBrowserRow';
import SettingsRow from '@/components/SettingsRow';
import AssistantNameToneSheet from '@apps/helm/components/settings/AssistantNameToneSheet';
import VoiceSettings from '@apps/helm/components/voice/VoiceSettings';
import ShiftCalendars from '@apps/helm/components/settings/ShiftCalendars';
import DeleteHelmData from '@apps/helm/components/settings/DeleteHelmData';
import WhatTheAiSees from '@apps/helm/components/settings/WhatTheAiSees';
import YourDaySheet from '@apps/helm/components/settings/YourDaySheet';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { useAppSelector } from '@/store';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useConnections } from '@/lib/connections/useConnections';
import { ASSISTANT_TONES, HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useAssistantTone } from '@apps/helm/hooks/useAssistantTone';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import { formatClockTime } from '@/utils/formatUtils';
import { helmAppName, helmTrustStore } from '@apps/helm/queries/helmKeyQueries';
import {
  formatUpdatedAt,
  getNewestOkAt,
  isStale,
} from '@apps/helm/utils/synced';

interface SettingsScreenProps {
  onBack: () => void;
  onOpenActivity: () => void;
  onOpenConnectedApps: () => void;
  onOpenSeesYou: () => void;
}

/** A utility screen: Back to Home, its title and its groups, with no ask bar. */
function SettingsScreen({
  onBack,
  onOpenActivity,
  onOpenConnectedApps,
  onOpenSeesYou,
}: SettingsScreenProps) {
  const { user, logOut } = useAuth();
  const assistant = useAssistantName();
  const tone = useAssistantTone();
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isSeesOpen, setIsSeesOpen] = useState(false);
  const { isVoiceSheetRequested, closeSheet } = useHelmUrlState();
  const [isVoiceOpen, setIsVoiceOpen] = useState(isVoiceSheetRequested);
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
        <SettingsSection title={HELM_COPY.settingsAssistant}>
          <SettingsRow
            icon={<Sparkles className='size-5' aria-hidden='true' />}
            title={HELM_COPY.assistantRow}
            description={HELM_COPY.assistantLine(
              assistant,
              ASSISTANT_TONES.find((option) => option.value === tone)?.label ??
                '',
            )}
            onClick={() => setIsAssistantOpen(true)}
            hasChevron
          />
        </SettingsSection>
        <ColoursSection />
        <SettingsSection title={HELM_COPY.settingsPlanning}>
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
        </SettingsSection>
        <SettingsSection title={HELM_COPY.settingsConnections}>
          <SettingsRow
            icon={<Link2 className='size-5' aria-hidden='true' />}
            title={HELM_COPY.connectedAppsRowTitle}
            description={
              !isKnown
                ? undefined
                : grants.length > 0
                  ? newestOkAt === null || !isStale(newestOkAt, now)
                    ? HELM_COPY.connectedAppsCount(grants.length)
                    : `${HELM_COPY.connectedAppsCount(grants.length)} · ${HELM_COPY.syncedStale(formatUpdatedAt(newestOkAt, now))}`
                  : keptCount > 0
                    ? `${HELM_COPY.connectedAppsNone} · ${HELM_COPY.keptCountLine(keptCount)}`
                    : HELM_COPY.connectedAppsNone
            }
            onClick={onOpenConnectedApps}
            hasChevron
          />
          <ShiftCalendars onOpenConnectedApps={onOpenConnectedApps} />
        </SettingsSection>
        <SettingsSection title={HELM_COPY.settingsVoice}>
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
        </SettingsSection>
        {user && (
          <section className='flex flex-col gap-2'>
            <h2 className='text-muted-foreground text-[13px] font-medium'>
              {HELM_COPY.settingsTrustedBrowsers}
            </h2>
            <TrustBrowserRow
              store={helmTrustStore}
              uid={user.uid}
              appName={helmAppName}
              onSignOutEverywhere={async () => {
                await signOutEverywhere();
                // The server has already ended every sign-in, so this browser leaves even if cleanup fails.
                await logOut({
                  hasAskedFirst: true,
                  landingNote: SIGNED_OUT_EVERYWHERE_NOTE,
                }).catch(async () => {
                  await signOut(auth).catch(() => undefined);
                  keepSignOutNote(SIGNED_OUT_EVERYWHERE_NOTE);
                  window.location.href = '/';
                });
              }}
            />
          </section>
        )}
        <SettingsSection title={HELM_COPY.settingsYourData}>
          <SettingsRow
            icon={<History className='size-5' aria-hidden='true' />}
            title={HELM_COPY.activityTitle}
            description={HELM_COPY.activityRowHint}
            onClick={onOpenActivity}
            hasChevron
          />
          <SettingsRow
            icon={<UserRound className='size-5' aria-hidden='true' />}
            title={HELM_COPY.seesYouTitle(assistant)}
            description={HELM_COPY.seesYouRowHint}
            onClick={onOpenSeesYou}
            hasChevron
          />
          <SettingsRow
            icon={<Eye className='size-5' aria-hidden='true' />}
            title={HELM_COPY.whatTheAiSees}
            description={HELM_COPY.whatTheAiSeesRowHint}
            onClick={() => setIsSeesOpen(true)}
            hasChevron
          />
          <DeleteHelmData connectionCount={grants.length} />
        </SettingsSection>
      </main>
      <AssistantNameToneSheet
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
      />
      <YourDaySheet isOpen={isDayOpen} onClose={() => setIsDayOpen(false)} />
      <VoiceSettings
        isOpen={isVoiceOpen}
        onClose={() => {
          setIsVoiceOpen(false);
          if (isVoiceSheetRequested) void closeSheet();
        }}
      />
      <WhatTheAiSees isOpen={isSeesOpen} onClose={() => setIsSeesOpen(false)} />
    </>
  );
}

export default SettingsScreen;
