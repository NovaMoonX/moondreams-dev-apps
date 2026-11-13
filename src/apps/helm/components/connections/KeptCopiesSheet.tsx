import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import LockedButton from '@/components/LockedButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import { deleteKeptCopies } from '@/lib/connections/connectionCalls';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { formatDateShort } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

interface KeptCopiesSheetProps {
  kept: {
    grantId: string;
    appName: string;
    count: number;
    deleteAfter: number | null;
  } | null;
  onClose: () => void;
}

function KeptForm({
  kept,
  onClose,
}: {
  kept: NonNullable<KeptCopiesSheetProps['kept']>;
  onClose: () => void;
}) {
  const name = useAssistantName();
  const { confirm } = useActionModal();
  const isOffline = useNetworkStatus() === 'offline';
  const [isDeleting, setIsDeleting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const deleteNow = async () => {
    const isConfirmed = await confirm({
      title: HELM_COPY.keptDeleteTitle(kept.appName),
      message: HELM_COPY.keptDeleteBody,
      confirmText: HELM_COPY.keptDeleteNow,
      destructive: true,
    });
    if (!isConfirmed) return;
    setIsDeleting(true);
    setFailure(null);
    try {
      await deleteKeptCopies({ grantId: kept.grantId });
      onClose();
    } catch (error) {
      console.error('Helm kept copies were not deleted', error);
      setFailure(HELM_COPY.keptDeleteFailed);
      setIsDeleting(false);
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.keptSheetBody(
          name,
          kept.count,
          kept.deleteAfter === null ? null : formatDateShort(kept.deleteAfter),
        )}
      </p>
      {failure && (
        <p className='text-destructive text-sm text-pretty' role='alert'>
          {failure}
        </p>
      )}
      <ModalFooterActions
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={onClose}
            disabled={isDeleting}
          >
            {HELM_COPY.keptClose}
          </Button>
        }
        rightActions={
          isOffline ? (
            <LockedButton
              label={HELM_COPY.keptDeleteNow}
              title={HELM_COPY.connectionsNeedConnection}
            >
              <p>{HELM_COPY.connectionsNeedConnectionBody}</p>
            </LockedButton>
          ) : (
            <Button
              type='button'
              variant='destructive'
              loading={isDeleting}
              onClick={() => void deleteNow()}
            >
              {HELM_COPY.keptDeleteNow}
            </Button>
          )
        }
      />
    </div>
  );
}

/** What is kept from an app that was disconnected, when it goes, and the way to delete it now. */
function KeptCopiesSheet({ kept, onClose }: KeptCopiesSheetProps) {
  return (
    <FormSheet
      isOpen={kept !== null}
      onClose={onClose}
      title={kept ? HELM_COPY.keptSheetTitle(kept.appName) : ''}
    >
      {kept && <KeptForm key={kept.grantId} kept={kept} onClose={onClose} />}
    </FormSheet>
  );
}

export default KeptCopiesSheet;
