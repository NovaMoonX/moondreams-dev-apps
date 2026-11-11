import { useState, type Ref } from 'react';

import { Search, Settings2 } from 'lucide-react';

import HeaderIconButton from '@/components/HeaderIconButton';
import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import Composer from '@apps/helm/components/home/Composer';
import ConversationThread from '@apps/helm/components/home/ConversationThread';
import CannotOpenState from '@apps/helm/components/states/CannotOpenState';
import NeedsConnectionState from '@apps/helm/components/states/NeedsConnectionState';
import { HELM_COPY } from '@apps/helm/constants';
import OutboxSummary from '@apps/helm/components/inbox/OutboxRow';
import {
  useCanUseDropBox,
  useOutboxEntries,
} from '@apps/helm/hooks/useCaptureOutbox';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useSession } from '@apps/helm/hooks/useSession';
import { hasLapsedTrust } from '@apps/helm/queries/helmKeyQueries';
import { retryKey, type KeyStatus } from '@apps/helm/store/helmSlice';

interface HomeSurfaceProps {
  composerRef: Ref<HTMLTextAreaElement>;
  onComposerFocusChange: (isFocused: boolean) => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
}

const getWaitingPlaceholder = (
  keyStatus: KeyStatus,
  canSaveOffline: boolean,
  name: string,
) => {
  if (keyStatus === 'offline') {
    return canSaveOffline ? null : HELM_COPY.outboxNeedsConnection(name);
  }
  if (keyStatus === 'failed') {
    return canSaveOffline ? null : HELM_COPY.composerBlocked;
  }
  return null;
};

function HomeSurface({
  composerRef,
  onComposerFocusChange,
  onOpenSettings,
  onOpenSearch,
}: HomeSurfaceProps) {
  const name = useAssistantName();
  const dispatch = useAppDispatch();
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const isKeyRetrying = useAppSelector((state) => state.helm.isKeyRetrying);
  const keyRefusals = useAppSelector((state) => state.helm.keyRefusals);
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const canSaveOffline =
    useCanUseDropBox(uid) &&
    (keyStatus === 'offline' || keyStatus === 'failed');
  // Words typed while waiting carry over to the field once the key is here.
  const [typedWaiting, setTypedWaiting] = useState('');
  const outbox = useOutboxEntries(uid);
  const { sessions, openSessionId } = useSession();
  const { isLoaded: isCapturesLoaded, isFailed: isCapturesFailed } =
    useAppSelector((state) => state.helm.recentCaptures);
  const hasTurns = sessions.length > 0;
  const voice = useHelmVoiceContext();

  return (
    <main className='flex flex-1 flex-col gap-8'>
      <div className='relative flex flex-col items-center gap-2 pt-10 text-center'>
        {keyStatus === 'ready' && (
          <div className='absolute top-0 right-0 flex items-center gap-2'>
            <HeaderIconButton
              icon={<Search className='size-4' aria-hidden='true' />}
              label={HELM_COPY.searchTitle}
              onClick={onOpenSearch}
            />
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
        {keyStatus === 'offline' && (
          <NeedsConnectionState
            name={name}
            canSave={canSaveOffline}
            isTrustLapsed={uid !== null && hasLapsedTrust(uid)}
          />
        )}
        <OutboxSummary uid={uid} entries={outbox} />
        {keyStatus === 'failed' && (
          <CannotOpenState
            isRetrying={isKeyRetrying}
            hasRetryFailed={keyRefusals > 1}
            onRetry={() => dispatch(retryKey())}
          />
        )}
        {/* While the voice is in use the dock's words take this place; the field keeps its draft and its room. */}
        <div className={voice.state === 'idle' ? undefined : 'invisible'}>
          <Composer
            key={keyStatus === 'ready' ? 'ready' : 'waiting'}
            fieldRef={composerRef}
            screen={null}
            onFocusChange={onComposerFocusChange}
            isReady={keyStatus === 'ready'}
            isOutbox={canSaveOffline}
            heldText={typedWaiting}
            onTextChange={setTypedWaiting}
            waitingPlaceholder={getWaitingPlaceholder(
              keyStatus,
              canSaveOffline,
              name,
            )}
          />
        </div>
      </div>
    </main>
  );
}

export default HomeSurface;
