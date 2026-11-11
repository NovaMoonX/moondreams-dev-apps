import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { useTrackAppUsage } from '@/hooks/useTrackAppUsage';
import { useLoadFeatureGates } from '@/hooks/useFeatureGates';
import Loading from '@/ui/Loading';
import HowNomosSeesYou from '@apps/helm/components/howNomosSeesYou/HowNomosSeesYou';
import HomeSurface from '@apps/helm/components/home/HomeSurface';
import InboxView from '@apps/helm/components/inbox/InboxView';
import AskConversation from '@apps/helm/components/shell/AskConversation';
import BrowseSheet from '@apps/helm/components/shell/BrowseSheet';
import HelmShell from '@apps/helm/components/shell/HelmShell';
import VoiceDock from '@apps/helm/components/shell/VoiceDock';
import GoogleConnectProvider from '@apps/helm/components/connections/GoogleConnectProvider';
import ConnectedAppsScreen from '@apps/helm/components/connections/ConnectedAppsScreen';
import ConnectionPage from '@apps/helm/components/connections/ConnectionPage';
import ActivityScreen from '@apps/helm/components/activity/ActivityScreen';
import SettingsScreen from '@apps/helm/components/settings/SettingsScreen';
import KnowledgeView from '@apps/helm/components/knowledge/KnowledgeView';
import TopicScreen from '@apps/helm/components/knowledge/TopicScreen';
import ProjectDetail from '@apps/helm/components/projects/ProjectDetail';
import ProjectsView from '@apps/helm/components/projects/ProjectsView';
import PlaceDetail from '@apps/helm/components/who/PlaceDetail';
import WhoDetail from '@apps/helm/components/who/WhoDetail';
import WhoView from '@apps/helm/components/who/WhoView';
import TasksView from '@apps/helm/components/tasks/TasksView';
import ComingUpView from '@apps/helm/components/comingUp/ComingUpView';
import TodayView from '@apps/helm/components/today/TodayView';
import { HelmVoiceContext, useHelmVoice } from '@apps/helm/hooks/useHelmVoice';
import { useHelmSync } from '@apps/helm/hooks/useHelmSync';
import { useHelmTheme } from '@apps/helm/hooks/useHelmTheme';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import { HELM_COPY } from '@apps/helm/constants';
import type { HelmView } from '@apps/helm/types';
import { VIEW_KINDS } from '@apps/helm/screen/views';
import { selectTopScreen } from '@apps/helm/store/screenSlice';

const ORIGIN_LABELS: Partial<Record<HelmView, string>> = {
  home: HELM_COPY.homeTitle,
  today: HELM_COPY.backToday,
  comingUp: HELM_COPY.comingUpTitle,
  people: HELM_COPY.peopleTitle,
  projects: HELM_COPY.projectsTitle,
};

function HelmApp() {
  const { user, loading } = useAuth();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const {
    view,
    grant,
    item,
    isBrowseOpen,
    isAskRequested,
    closeAsk,
    openBrowse,
    closeBrowse,
    showView,
    goHome,
    goBack,
    origin,
    goBackToOrigin,
    goUpTo,
  } = useHelmUrlState();

  useHelmTheme();
  useTrackAppUsage('helm', user?.uid ?? null);
  useLoadFeatureGates('helm', user?.uid ?? null);
  useHelmSync(user?.uid ?? null, user?.displayName ?? null);
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

  const toBackLabel = (fallback: string) =>
    origin === null
      ? fallback
      : (ORIGIN_LABELS[origin] ?? HELM_COPY.backGeneric);
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
            onOpenComingUp={() => showView('comingUp')}
            onOpenWho={(whoId) => showView('who', whoId)}
          />
        )}
        {!isLocked && view === 'comingUp' && (
          <ComingUpView
            backLabel={toBackLabel(HELM_COPY.backToday)}
            onBack={goBackToOrigin}
            onHome={goHome}
            onOpenWho={(whoId) => showView('who', whoId)}
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
            onOpenSeesYou={() => showView('howNomosSeesYou')}
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
        {!isLocked && view === 'people' && (
          <WhoView
            onBack={goBack}
            onHome={goHome}
            onOpenWho={(whoId) => showView('who', whoId)}
          />
        )}
        {!isLocked && view === 'who' && (
          <WhoDetail
            whoId={item}
            backLabel={toBackLabel(HELM_COPY.peopleTitle)}
            onBack={goBackToOrigin}
            onHome={goHome}
          />
        )}
        {!isLocked && view === 'projects' && (
          <ProjectsView
            onBack={goBack}
            onHome={goHome}
            onOpenProject={(projectId) => showView('project', projectId)}
          />
        )}
        {!isLocked && view === 'project' && (
          <ProjectDetail
            projectId={item}
            backLabel={toBackLabel(HELM_COPY.projectsTitle)}
            onBack={goBackToOrigin}
            onHome={goHome}
            onOpenWho={(whoId) => showView('who', whoId)}
          />
        )}
        {!isLocked && view === 'knowledge' && (
          <KnowledgeView
            onBack={goBack}
            onHome={goHome}
            onOpenTopic={(topicId) => showView('topic', topicId)}
          />
        )}
        {!isLocked && view === 'topic' && (
          <TopicScreen
            key={item}
            topicId={item}
            onBack={goBackToOrigin}
            onHome={goHome}
            onOpenTopic={(topicId) => showView('topic', topicId)}
            onOpenParent={(topicId) => void goUpTo('topic', topicId)}
          />
        )}
        {!isLocked && view === 'howNomosSeesYou' && (
          <HowNomosSeesYou onBack={goBack} onHome={goHome} />
        )}
        {!isLocked && view === 'place' && (
          <PlaceDetail placeId={item} onBack={goBack} onHome={goHome} />
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

function Helm() {
  return (
    <GoogleConnectProvider>
      <HelmApp />
    </GoogleConnectProvider>
  );
}

export default Helm;
