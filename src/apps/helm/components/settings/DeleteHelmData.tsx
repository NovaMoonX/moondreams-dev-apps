import { useState } from 'react';

import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Lock, Trash2 } from 'lucide-react';

import SettingsRow from '@/components/SettingsRow';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { helmAppName } from '@apps/helm/queries/helmKeyQueries';
import {
  deleteAllHelmData,
  reopenHelmToFirstRun,
} from '@apps/helm/store/actions/settingsActions';

const readFailure = (error: unknown) => {
  const code = (error as { code?: string } | null)?.code ?? '';
  if (
    code === 'functions/unavailable' ||
    code === 'functions/deadline-exceeded'
  )
    return HELM_COPY.deleteAllUnreachable;
  if (code.startsWith('auth/')) return HELM_COPY.deleteAllSignIn;
  return HELM_COPY.deleteAllFailed;
};

interface DeleteHelmDataProps {
  connectionCount: number;
}

/** The last row of Settings: deletes everything the app holds for the person, on the server, then this browser starts over. */
function DeleteHelmData({ connectionCount }: DeleteHelmDataProps) {
  const { user } = useAuth();
  const assistant = useAssistantName();
  const { alert, confirm } = useActionModal();
  const isOffline = useNetworkStatus() === 'offline';
  const [isDeleting, setIsDeleting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const held = useAppSelector((state) =>
    HELM_COPY.deleteAllKinds({
      tasks: state.helm.openTasks.items.length,
      people: state.helm.who.items.length,
      places: state.helm.places.items.length,
      projects: state.helm.projects.items.length,
      procedures: state.helm.procedures.items.length,
      topics: state.helm.topics.items.length,
      notes: state.helm.notes.items.length,
      photos: state.helm.media.items.length,
      connections: connectionCount,
    }).join('|'),
  );
  const title = HELM_COPY.deleteAllTitle(helmAppName);

  if (isOffline) {
    return (
      <SettingsRow
        icon={<Lock className='size-5' />}
        title={title}
        description={HELM_COPY.connectionsNeedConnection}
        onClick={() =>
          void alert({
            title: HELM_COPY.connectionsNeedConnection,
            message: HELM_COPY.deleteAllNeedsConnectionBody,
          })
        }
        hasChevron
      />
    );
  }

  const run = async () => {
    if (!user || isDeleting) return;
    const isConfirmed = await confirm({
      title: HELM_COPY.deleteAllConfirmTitle(helmAppName),
      message: HELM_COPY.deleteAllConfirmBody(
        held === '' ? [] : held.split('|'),
        assistant,
      ),
      confirmText: HELM_COPY.deleteAllConfirmAction,
      destructive: true,
    });
    if (!isConfirmed) return;
    setFailure(null);
    setIsDeleting(true);
    try {
      await deleteAllHelmData(user.uid);
      reopenHelmToFirstRun();
    } catch (error) {
      console.error('Helm data was not deleted', error);
      setFailure(readFailure(error));
      setIsDeleting(false);
    }
  };

  return (
    <SettingsRow
      icon={<Trash2 className='text-destructive size-5' />}
      title={title}
      description={
        isDeleting ? HELM_COPY.deleteAllWorking : HELM_COPY.deleteAllRowHint
      }
      onClick={isDeleting ? undefined : () => void run()}
      hasChevron={!isDeleting}
    >
      {failure && (
        <p role='alert' className='text-destructive text-sm text-pretty'>
          {failure}
        </p>
      )}
    </SettingsRow>
  );
}

export default DeleteHelmData;
