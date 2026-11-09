import { useRef } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useTrackAppUsage } from '@/hooks/useTrackAppUsage';
import Loading from '@/ui/Loading';
import HomeSurface from '@apps/helm/components/home/HomeSurface';
import BrowseSheet from '@apps/helm/components/shell/BrowseSheet';
import HelmShell from '@apps/helm/components/shell/HelmShell';
import VoiceDock from '@apps/helm/components/shell/VoiceDock';
import TodayView from '@apps/helm/components/today/TodayView';
import { useHelmSync } from '@apps/helm/hooks/useHelmSync';
import { useHelmTheme } from '@apps/helm/hooks/useHelmTheme';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import { VIEW_KINDS } from '@apps/helm/screen/views';

function Helm() {
  const { user, loading } = useAuth();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const { view, isBrowseOpen, openBrowse, closeBrowse, showView, goHome } =
    useHelmUrlState();

  useHelmTheme();
  useTrackAppUsage('helm', user?.uid ?? null);
  useHelmSync(user?.uid ?? null);

  if (loading) return <Loading />;

  const focusComposer = () => composerRef.current?.focus();
  const isHome = VIEW_KINDS[view] === 'home';

  return (
    <HelmShell
      dock={
        isHome && (
          <VoiceDock
            onBrowse={openBrowse}
            onTalk={focusComposer}
            onType={focusComposer}
          />
        )
      }
    >
      {isHome && <HomeSurface composerRef={composerRef} />}
      {view === 'today' && <TodayView onBack={goHome} onHome={goHome} />}
      <BrowseSheet
        isOpen={isBrowseOpen && isHome}
        onClose={closeBrowse}
        onOpenView={showView}
      />
    </HelmShell>
  );
}

export default Helm;
