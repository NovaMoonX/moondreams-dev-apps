import { useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { useTrackAppUsage } from '@/hooks/useTrackAppUsage';
import Loading from '@/ui/Loading';
import HomeSurface from '@apps/helm/components/home/HomeSurface';
import InboxView from '@apps/helm/components/inbox/InboxView';
import BrowseSheet from '@apps/helm/components/shell/BrowseSheet';
import HelmShell from '@apps/helm/components/shell/HelmShell';
import VoiceDock from '@apps/helm/components/shell/VoiceDock';
import ActivityScreen from '@apps/helm/components/activity/ActivityScreen';
import SettingsScreen from '@apps/helm/components/settings/SettingsScreen';
import TodayView from '@apps/helm/components/today/TodayView';
import { useHelmSync } from '@apps/helm/hooks/useHelmSync';
import { useHelmTheme } from '@apps/helm/hooks/useHelmTheme';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import { VIEW_KINDS } from '@apps/helm/screen/views';

function Helm() {
  const { user, loading } = useAuth();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const {
    view,
    isBrowseOpen,
    openBrowse,
    closeBrowse,
    showView,
    goHome,
    goBack,
  } = useHelmUrlState();

  useHelmTheme();
  useTrackAppUsage('helm', user?.uid ?? null);
  useHelmSync(user?.uid ?? null);
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);

  if (loading) return <Loading />;

  const focusComposer = () => composerRef.current?.focus();
  // Without the key nothing opens, so every view gives way to home and its state card, with no dock until typing can be kept.
  const isLocked = keyStatus === 'offline' || keyStatus === 'failed';
  const isHome = isLocked || VIEW_KINDS[view] === 'home';

  return (
    <HelmShell
      dock={
        // The keyboard takes the dock's place while the field is in use, so what is typed stays in view.
        isHome &&
        !isLocked &&
        !isComposing && (
          <VoiceDock
            onBrowse={openBrowse}
            onTalk={focusComposer}
            onType={focusComposer}
          />
        )
      }
    >
      {isHome && (
        <HomeSurface
          composerRef={composerRef}
          onComposerFocusChange={setIsComposing}
          onOpenSettings={() => showView('settings')}
        />
      )}
      {!isLocked && view === 'today' && (
        <TodayView onBack={goHome} onHome={goHome} />
      )}
      {!isLocked && view === 'inbox' && (
        <InboxView onBack={goHome} onHome={goHome} />
      )}
      {!isLocked && view === 'settings' && (
        <SettingsScreen
          onBack={goBack}
          onOpenActivity={() => showView('activity')}
        />
      )}
      {!isLocked && view === 'activity' && <ActivityScreen onBack={goBack} />}
      <BrowseSheet
        isOpen={isBrowseOpen && isHome && !isLocked}
        onClose={closeBrowse}
        onOpenView={showView}
      />
    </HelmShell>
  );
}

export default Helm;
