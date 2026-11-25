import { Fragment, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight, Lock } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import DeleteIconButton from '@/components/DeleteIconButton';
import DetailSheet from '@/components/DetailSheet';
import { afterBackLayersClose } from '@/hooks/useBackHistory';
import { useWaitUntilShown } from '@/hooks/useWaitUntilShown';
import { useIsGateOpen } from '@/hooks/useFeatureGates';
import { useConnections } from '@/lib/connections/useConnections';
import {
  disconnectMcpClient,
  setMcpCanChangeApps,
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
  const [pendingCanWrite, setPendingCanWrite] = useState<boolean | null>(null);
  const [pendingCanChange, setPendingCanChange] = useState<boolean | null>(
    null,
  );
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [pendingScopes, setPendingScopes] = useState<
    Partial<Record<McpReadScope, boolean>>
  >({});
  const waitFor = useWaitUntilShown(assistant);
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
    if (!assistant || pendingScopes[scope] !== undefined) return;
    setPendingScopes((pending) => ({ ...pending, [scope]: isOn }));
    try {
      await setMcpReadScope(assistant.clientKey, scope, isOn);
      await waitFor(
        (current) =>
          current === null || current.readScopes.includes(scope) === isOn,
      );
    } catch (error) {
      console.error('Helm assistant permission was not updated', error);
      addToast({ title: HELM_COPY.assistantUpdateFailed, type: 'error' });
    } finally {
      setPendingScopes((pending) =>
        Object.fromEntries(
          Object.entries(pending).filter(([key]) => key !== scope),
        ),
      );
    }
  };

  const setCanWrite = async (canWrite: boolean) => {
    if (!assistant || pendingCanWrite !== null) return;
    setPendingCanWrite(canWrite);
    try {
      await updateMcpClient(assistant.clientKey, canWrite);
      await waitFor(
        (current) => current === null || current.canWrite === canWrite,
      );
    } catch (error) {
      console.error('Helm assistant was not updated', error);
      addToast({ title: HELM_COPY.assistantUpdateFailed, type: 'error' });
    } finally {
      setPendingCanWrite(null);
    }
  };

  const setCanChangeApps = async (canChangeApps: boolean) => {
    if (!assistant || pendingCanChange !== null) return;
    setPendingCanChange(canChangeApps);
    try {
      await setMcpCanChangeApps(assistant.clientKey, canChangeApps);
      await waitFor(
        (current) =>
          current === null || current.canChangeApps === canChangeApps,
      );
    } catch (error) {
      console.error('Helm assistant change permission was not updated', error);
      addToast({ title: HELM_COPY.assistantUpdateFailed, type: 'error' });
    } finally {
      setPendingCanChange(null);
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

  const canWrite = pendingCanWrite ?? assistant?.canWrite ?? false;
  const canChangeApps = pendingCanChange ?? assistant?.canChangeApps ?? false;

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
                {HELM_COPY.assistantWritesHint(canWrite)}
              </p>
            </div>
            <AppToggle
              aria-label={HELM_COPY.assistantWrites(helmAppName)}
              checked={canWrite}
              onCheckedChange={(checked) => void setCanWrite(checked)}
            />
          </div>
          {shownScopes.map((scope) => {
            const isOn =
              pendingScopes[scope] ?? assistant.readScopes.includes(scope);
            return (
              <Fragment key={scope}>
                <div className='flex items-start justify-between gap-3'>
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
                          { isOn, canWrite },
                        )}
                      </p>
                    ) : (
                      <p className='text-muted-foreground flex items-center gap-1.5 text-[13px] text-pretty'>
                        <Lock
                          className='size-3.5 shrink-0'
                          aria-hidden='true'
                        />
                        {HELM_COPY.assistantNeedsSource(scope)}
                      </p>
                    )}
                  </div>
                  {(isConnected(scope) || isOn) && (
                    <AppToggle
                      aria-label={HELM_COPY.assistantReadScopeLabels[scope]}
                      checked={isOn}
                      onCheckedChange={(checked) =>
                        void setReadScope(scope, checked)
                      }
                    />
                  )}
                </div>
                {scope === 'apps' && (
                  <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <p className='text-[15px] font-medium'>
                        {HELM_COPY.assistantChangesLabel}
                      </p>
                      <p className='text-muted-foreground text-[13px] text-pretty'>
                        {HELM_COPY.assistantChangesHint(
                          assistant.name,
                          canChangeApps,
                        )}
                      </p>
                    </div>
                    <AppToggle
                      aria-label={HELM_COPY.assistantChangesLabel}
                      checked={canChangeApps}
                      onCheckedChange={(checked) =>
                        void setCanChangeApps(checked)
                      }
                    />
                  </div>
                )}
              </Fragment>
            );
          })}
          {shownScopes.some((scope) => !isConnected(scope)) && (
            <Button
              variant='secondary'
              size='sm'
              className='self-start'
              onClick={() => afterBackLayersClose(onOpenConnectedApps)}
            >
              {HELM_COPY.assistantOpenConnectedApps}
              <ChevronRight className='size-4' aria-hidden='true' />
            </Button>
          )}
          {assistant.name === 'Gemini' && (
            <p className='text-muted-foreground text-[13px] text-pretty'>
              {HELM_COPY.assistantGeminiAsks(helmAppName)}
            </p>
          )}
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
