import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Lock } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import DeleteIconButton from '@/components/DeleteIconButton';
import DetailSheet from '@/components/DetailSheet';
import { afterBackLayersClose } from '@/hooks/useBackHistory';
import { useIsGateOpen } from '@/hooks/useFeatureGates';
import { useConnections } from '@/lib/connections/useConnections';
import {
  disconnectMcpClient,
  setMcpReadScope,
  updateMcpClient,
  type McpReadScope,
} from '@/lib/mcp/mcpCalls';
import { formatDate } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { helmAppName } from '@apps/helm/queries/helmKeyQueries';
import type { OpenConnectedAssistant } from '@apps/helm/types';

interface AssistantSheetProps {
  assistant: OpenConnectedAssistant | null;
  onClose: () => void;
  /** Where Gmail, Drive and the apps are connected. */
  onOpenConnectedApps: () => void;
}

const readScopeOf = (connectorId: string): McpReadScope | null =>
  connectorId === 'google:gmail'
    ? 'mail'
    : connectorId === 'google:drive'
      ? 'drive'
      : connectorId.startsWith('app:')
        ? 'apps'
        : null;

const READ_SCOPE_ORDER: McpReadScope[] = ['mail', 'drive', 'apps'];

/** One connected assistant: what it can do, when it connected, and the way to disconnect it. */
function AssistantSheet({
  assistant,
  onClose,
  onOpenConnectedApps,
}: AssistantSheetProps) {
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [busyScopes, setBusyScopes] = useState<McpReadScope[]>([]);
  const { grants } = useConnections({ readerAppId: 'helm' });
  const isGoogleReadOpen = useIsGateOpen('helm', 'google-mail-and-drive');
  const shownScopes = READ_SCOPE_ORDER.filter(
    (scope) => scope === 'apps' || isGoogleReadOpen,
  );
  const isConnected = (scope: McpReadScope) =>
    grants.some(
      (grant) =>
        grant.status !== 'ended' && readScopeOf(grant.connectorId) === scope,
    );

  const setReadScope = async (scope: McpReadScope, isOn: boolean) => {
    if (!assistant || busyScopes.includes(scope)) return;
    setBusyScopes((busy) => [...busy, scope]);
    try {
      await setMcpReadScope(assistant.clientKey, scope, isOn);
    } catch (error) {
      console.error('Helm assistant permission was not updated', error);
      addToast({ title: HELM_COPY.assistantUpdateFailed, type: 'error' });
    } finally {
      setBusyScopes((busy) => busy.filter((entry) => entry !== scope));
    }
  };

  const setCanWrite = async (canWrite: boolean) => {
    if (!assistant || isSaving) return;
    setIsSaving(true);
    try {
      await updateMcpClient(assistant.clientKey, canWrite);
    } catch (error) {
      console.error('Helm assistant was not updated', error);
      addToast({ title: HELM_COPY.assistantUpdateFailed, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const disconnect = async () => {
    if (!assistant || isDisconnecting) return;
    const isConfirmed = await confirm({
      title: HELM_COPY.assistantDisconnectTitle(assistant.name),
      message: HELM_COPY.assistantDisconnectBody(assistant.name, helmAppName),
      confirmText: HELM_COPY.assistantDisconnect,
      destructive: true,
    });
    if (!isConfirmed) return;
    setIsDisconnecting(true);
    try {
      await disconnectMcpClient(assistant.clientKey);
      addToast({
        title: HELM_COPY.assistantDisconnected(assistant.name),
        type: 'success',
      });
      onClose();
    } catch (error) {
      console.error('Helm assistant was not disconnected', error);
      addToast({ title: HELM_COPY.assistantDisconnectFailed, type: 'error' });
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <DetailSheet
      isOpen={assistant !== null}
      onClose={onClose}
      title={assistant?.name ?? ''}
      footer={
        <div className='flex justify-end'>
          <DeleteIconButton
            onClick={() => void disconnect()}
            disabled={isDisconnecting}
            label={HELM_COPY.assistantDisconnect}
          />
        </div>
      }
    >
      {assistant && (
        <div className='flex flex-col gap-4'>
          <p className='text-[15px]'>{HELM_COPY.assistantReads}</p>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <p className='text-[15px] font-medium'>
                {HELM_COPY.assistantWrites(helmAppName)}
              </p>
              <p className='text-muted-foreground text-[13px] text-pretty'>
                {HELM_COPY.assistantWritesHint(assistant.canWrite)}
              </p>
            </div>
            <AppToggle
              aria-label={HELM_COPY.assistantWrites(helmAppName)}
              checked={assistant.canWrite}
              onCheckedChange={(checked) => void setCanWrite(checked)}
            />
          </div>
          {shownScopes.map((scope) => {
            const isOn = assistant.readScopes.includes(scope);
            return (
              <div
                key={scope}
                className='flex items-start justify-between gap-3'
              >
                <div className='min-w-0'>
                  <p className='text-[15px] font-medium'>
                    {HELM_COPY.assistantReadScopeLabels[scope]}
                  </p>
                  {isConnected(scope) ? (
                    <p className='text-muted-foreground text-[13px] text-pretty'>
                      {HELM_COPY.assistantReadScopeHint(
                        scope,
                        assistant.name,
                        helmAppName,
                        { isOn, canWrite: assistant.canWrite },
                      )}
                    </p>
                  ) : (
                    <div className='flex flex-col items-start gap-1'>
                      <p className='text-muted-foreground flex items-center gap-1.5 text-[13px] text-pretty'>
                        <Lock
                          className='size-3.5 shrink-0'
                          aria-hidden='true'
                        />
                        {HELM_COPY.assistantNeedsSource(scope)}
                      </p>
                      <Button
                        variant='tertiary'
                        size='sm'
                        className='px-0!'
                        onClick={() =>
                          afterBackLayersClose(onOpenConnectedApps)
                        }
                      >
                        {HELM_COPY.assistantOpenConnectedApps}
                      </Button>
                    </div>
                  )}
                </div>
                {(isConnected(scope) || isOn) && (
                  <AppToggle
                    aria-label={HELM_COPY.assistantReadScopeLabels[scope]}
                    checked={isOn}
                    disabled={busyScopes.includes(scope)}
                    onCheckedChange={(checked) =>
                      void setReadScope(scope, checked)
                    }
                  />
                )}
              </div>
            );
          })}
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.assistantPrivacy(assistant.name)}
          </p>
          <p className='text-muted-foreground text-[13px]'>
            {HELM_COPY.assistantConnectedOn(formatDate(assistant.firstSeenAt))}
          </p>
        </div>
      )}
    </DetailSheet>
  );
}

export default AssistantSheet;
