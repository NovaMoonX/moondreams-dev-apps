import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { useTrackAppUsage } from '@/hooks/useTrackAppUsage';
import Loading from '@/ui/Loading';
import HomeSurface from '@apps/helm/components/home/HomeSurface';
import InboxView from '@apps/helm/components/inbox/InboxView';
import AskConversation from '@apps/helm/components/shell/AskConversation';
import BrowseSheet from '@apps/helm/components/shell/BrowseSheet';
import HelmShell from '@apps/helm/components/shell/HelmShell';
import VoiceDock from '@apps/helm/components/shell/VoiceDock';
import ConnectedAppsScreen from '@apps/helm/components/connections/ConnectedAppsScreen';
import ConnectionPage from '@apps/helm/components/connections/ConnectionPage';
import ActivityScreen from '@apps/helm/components/activity/ActivityScreen';
import SettingsScreen from '@apps/helm/components/settings/SettingsScreen';
import TasksView from '@apps/helm/components/tasks/TasksView';
import TodayView from '@apps/helm/components/today/TodayView';
import { HelmVoiceContext, useHelmVoice } from '@apps/helm/hooks/useHelmVoice';
import { useHelmSync } from '@apps/helm/hooks/useHelmSync';
import { useHelmTheme } from '@apps/helm/hooks/useHelmTheme';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import { VIEW_KINDS } from '@apps/helm/screen/views';
import { selectTopScreen } from '@apps/helm/store/screenSlice';

function Helm() {
  const { user, loading } = useAuth();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const {
    view,
    grant,
    isBrowseOpen,
    isAskRequested,
    closeAsk,
    openBrowse,
    closeBrowse,
    showView,
    goHome,
    goBack,
  } = useHelmUrlState();

  useHelmTheme();
  useTrackAppUsage('helm', user?.uid ?? null);
  useHelmSync(user?.uid ?? null);
  const voice = useHelmVoice();
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const screen = useAppSelector(selectTopScreen);
  const isLocked = keyStatus === 'offline' || keyStatus === 'failed';

  // A reload with the conversation open waits for the page to publish (children's effects run before this one); a view with nothing to ask about drops the request.
  useEffect(() => {
    if (loading || !isAskRequested) return;
    if (isLocked || selectTopScreen(store.getState()) === null) {
      void closeAsk();
    }
  }, [loading, isAskRequested, isLocked, view, closeAsk]);

  const isVoiceShown =
    !isLocked && (VIEW_KINDS[view] === 'home' || isAskRequested);
  useEffect(() => {
    voice.setSurfaceShown(isVoiceShown);
  });

  if (loading) return <Loading />;

  const focusComposer = () => composerRef.current?.focus();
  // Without the key nothing opens, so every view gives way to home and its state card, with no dock until typing can be kept.
  const isHome = isLocked || VIEW_KINDS[view] === 'home';

  return (
    <HelmVoiceContext.Provider value={voice}>
      <HelmShell
        isAskAvailable={!isLocked}
        dock={
          // The keyboard takes the dock's place while the field is in use, so what is typed stays in view.
          isHome &&
          !isLocked &&
          !isComposing && (
            <VoiceDock
              onBrowse={openBrowse}
              onTalkBlocked={focusComposer}
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
          <TodayView
            onBack={goHome}
            onHome={goHome}
            onOpenTasks={() => showView('tasks')}
          />
        )}
        {!isLocked && view === 'tasks' && (
          <TasksView onBack={goBack} onHome={goHome} />
        )}
        {!isLocked && view === 'inbox' && (
          <InboxView onBack={goHome} onHome={goHome} />
        )}
        {!isLocked && view === 'settings' && (
          <SettingsScreen
            onBack={goBack}
            onOpenActivity={() => showView('activity')}
            onOpenConnectedApps={() => showView('connectedApps')}
          />
        )}
        {!isLocked && view === 'activity' && <ActivityScreen onBack={goBack} />}
        {!isLocked && view === 'connectedApps' && (
          <ConnectedAppsScreen
            onBack={goBack}
            onOpenConnection={(grantId) => showView('connection', grantId)}
          />
        )}
        {!isLocked && view === 'connection' && (
          <ConnectionPage grantId={grant} onBack={goBack} />
        )}
        {isAskRequested && !isLocked && screen && (
          <AskConversation entry={screen} onClose={() => void closeAsk()} />
        )}
        <BrowseSheet
          isOpen={isBrowseOpen && isHome && !isLocked}
          onClose={closeBrowse}
          onOpenView={showView}
        />
      </HelmShell>
    </HelmVoiceContext.Provider>
  );
}

export default Helm;
