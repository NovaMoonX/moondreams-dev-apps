import type { Ref } from 'react';

import { Settings2 } from 'lucide-react';

import HeaderIconButton from '@/components/HeaderIconButton';
import { useAppDispatch, useAppSelector } from '@/store';
import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import Composer from '@apps/helm/components/home/Composer';
import ConversationThread from '@apps/helm/components/home/ConversationThread';
import MuteControl from '@apps/helm/components/voice/MuteControl';
import CannotOpenState from '@apps/helm/components/states/CannotOpenState';
import NeedsConnectionState from '@apps/helm/components/states/NeedsConnectionState';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useSession } from '@apps/helm/hooks/useSession';
import { retryKey, type KeyStatus } from '@apps/helm/store/helmSlice';

interface HomeSurfaceProps {
  composerRef: Ref<HTMLTextAreaElement>;
  onComposerFocusChange: (isFocused: boolean) => void;
  onOpenSettings: () => void;
}

const WAITING_PLACEHOLDER: Record<KeyStatus, string | null> = {
  loading: null,
  ready: null,
  offline: HELM_COPY.composerOffline,
  failed: HELM_COPY.composerBlocked,
};

function HomeSurface({
  composerRef,
  onComposerFocusChange,
  onOpenSettings,
}: HomeSurfaceProps) {
  const name = useAssistantName();
  const dispatch = useAppDispatch();
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const isKeyRetrying = useAppSelector((state) => state.helm.isKeyRetrying);
  const keyRefusals = useAppSelector((state) => state.helm.keyRefusals);
  const { sessions, openSessionId } = useSession();
  const { isLoaded: isCapturesLoaded, isFailed: isCapturesFailed } =
    useAppSelector((state) => state.helm.recentCaptures);
  const hasTurns = sessions.length > 0;

  return (
    <main className='flex flex-1 flex-col gap-8'>
      <div className='relative flex flex-col items-center gap-2 pt-10 text-center'>
        {keyStatus === 'ready' && (
          <div className='absolute top-0 left-0'>
            <MuteControl shows='whileMuted' />
          </div>
        )}
        {keyStatus === 'ready' && (
          <div className='absolute top-0 right-0'>
            <HeaderIconButton
              icon={<Settings2 className='size-4' aria-hidden='true' />}
              label={HELM_COPY.settingsTitle}
              onClick={onOpenSettings}
            />
          </div>
        )}
        <div className='flex items-center gap-2'>
          <AssistantMark name={name} isLarge />
          <h1 className='helm-serif text-[28px] leading-[34px]'>{name}</h1>
        </div>
        {keyStatus !== 'offline' && keyStatus !== 'failed' && (
          <p className='text-muted-foreground text-[15px]'>
            {HELM_COPY.homeHint}
          </p>
        )}
      </div>
      {isCapturesFailed && !isCapturesLoaded && (
        <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
          {HELM_COPY.turnsFailed}
        </p>
      )}
      {isCapturesLoaded && !hasTurns && (
        <p className='helm-card p-4 text-[15px] text-pretty'>
          {HELM_COPY.firstOpen(name)}
        </p>
      )}
      {hasTurns && (
        <ConversationThread
          sessions={sessions}
          openSessionId={openSessionId}
          scroll='window'
          loadsEarlier
        />
      )}
      <div className='mt-auto flex flex-col gap-4'>
        {keyStatus === 'offline' && <NeedsConnectionState name={name} />}
        {keyStatus === 'failed' && (
          <CannotOpenState
            isRetrying={isKeyRetrying}
            hasRetryFailed={keyRefusals > 1}
            onRetry={() => dispatch(retryKey())}
          />
        )}
        <Composer
          key={keyStatus === 'ready' ? 'ready' : 'waiting'}
          fieldRef={composerRef}
          screen={null}
          onFocusChange={onComposerFocusChange}
          isReady={keyStatus === 'ready'}
          waitingPlaceholder={WAITING_PLACEHOLDER[keyStatus]}
        />
      </div>
    </main>
  );
}

export default HomeSurface;
