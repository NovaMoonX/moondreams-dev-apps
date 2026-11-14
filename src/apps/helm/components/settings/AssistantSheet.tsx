import { useState } from 'react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AppToggle from '@/components/AppToggle';
import DeleteIconButton from '@/components/DeleteIconButton';
import DetailSheet from '@/components/DetailSheet';
import { disconnectMcpClient, updateMcpClient } from '@/lib/mcp/mcpCalls';
import { formatDate } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { helmAppName } from '@apps/helm/queries/helmKeyQueries';
import type { OpenConnectedAssistant } from '@apps/helm/types';

interface AssistantSheetProps {
  assistant: OpenConnectedAssistant | null;
  onClose: () => void;
}

/** One connected assistant: what it can do, when it connected, and the way to disconnect it. */
function AssistantSheet({ assistant, onClose }: AssistantSheetProps) {
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

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
          <p className='text-[15px]'>{HELM_COPY.assistantReads(helmAppName)}</p>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <p className='text-[15px] font-medium'>
                {HELM_COPY.assistantWrites(helmAppName)}
              </p>
              <p className='text-muted-foreground text-[13px] text-pretty'>
                {HELM_COPY.assistantWritesHint(helmAppName)}
              </p>
            </div>
            <AppToggle
              aria-label={HELM_COPY.assistantWrites(helmAppName)}
              checked={assistant.canWrite}
              onCheckedChange={(checked) => void setCanWrite(checked)}
            />
          </div>
          <p className='text-muted-foreground text-[13px]'>
            {HELM_COPY.assistantConnectedOn(formatDate(assistant.firstSeenAt))}
          </p>
        </div>
      )}
    </DetailSheet>
  );
}

export default AssistantSheet;
