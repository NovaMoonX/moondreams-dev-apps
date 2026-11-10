import { useState } from 'react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import HelpTip from '@/components/HelpTip';
import LockedButton from '@/components/LockedButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import { endConnection } from '@/lib/connections/connectionCalls';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useNow } from '@/hooks/useNow';
import { formatDateShort } from '@/utils/formatUtils';
import {
  DAY_MS,
  DISCONNECT_DELETES_BY_DEFAULT,
  HELM_COPY,
  KEPT_COPY_DAYS,
} from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

interface DisconnectSheetProps {
  isOpen: boolean;
  onClose: () => void;
  grantId: string;
  appName: string;
  /** How many copies from this app Helm holds. */
  count: number;
  failureLine: (error: unknown) => string;
  /** The account's own name when the connection is one of several of the same service; it names the sheet. */
  accountName?: string | null;
  /** What the copies are, from the kind of thing the connection reads; null reads as "things". */
  countKind?: string | null;
  /** A small explanation beside the sentence, when the connection has more to say. */
  note?: { title: string; text: string } | null;
  /** One more plain line under the sentence, for what this connection's end does to what was kept from it. */
  extraLine?: string | null;
}

function DisconnectForm({
  onClose,
  grantId,
  appName,
  count,
  failureLine,
  countKind = null,
  note = null,
  extraLine = null,
}: Omit<DisconnectSheetProps, 'isOpen'>) {
  const name = useAssistantName();
  const now = useNow(60_000);
  const isOffline = useNetworkStatus() === 'offline';
  const [deletesCopies, setDeletesCopies] = useState(
    DISCONNECT_DELETES_BY_DEFAULT,
  );
  const [isEnding, setIsEnding] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const disconnect = async () => {
    if (isEnding) return;
    setIsEnding(true);
    setFailure(null);
    try {
      await endConnection({
        grantId,
        deleteCopies: deletesCopies,
      });
      onClose();
    } catch (error) {
      console.error('Helm connection did not end', error);
      setFailure(failureLine(error));
      setIsEnding(false);
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.disconnectBody(name, appName)}
        {note && (
          <>
            {' '}
            <HelpTip title={note.title} placement='top'>
              <p>{note.text}</p>
            </HelpTip>
          </>
        )}
      </p>
      {extraLine && (
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {extraLine}
        </p>
      )}
      {count > 0 && (
        <div className='flex flex-col gap-1'>
          <label className='flex min-h-12 items-start gap-3 py-2'>
            <Checkbox
              className='mt-0.5'
              checked={deletesCopies}
              disabled={isEnding}
              onCheckedChange={setDeletesCopies}
            />
            <span className='text-foreground text-[15px] text-pretty'>
              {HELM_COPY.disconnectDeleteBox(count, appName, countKind)}
            </span>
          </label>
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {deletesCopies
              ? HELM_COPY.disconnectDeleteNote
              : HELM_COPY.disconnectKeepNote(
                  formatDateShort(now + KEPT_COPY_DAYS * DAY_MS),
                )}
          </p>
        </div>
      )}
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
            disabled={isEnding}
          >
            {HELM_COPY.disconnectCancel}
          </Button>
        }
        rightActions={
          isOffline ? (
            <LockedButton
              label={HELM_COPY.disconnectConfirm}
              title={HELM_COPY.connectionsNeedConnection}
            >
              <p>{HELM_COPY.connectionsNeedConnectionBody}</p>
            </LockedButton>
          ) : (
            <Button
              type='button'
              variant='destructive'
              loading={isEnding}
              onClick={() => void disconnect()}
            >
              {HELM_COPY.disconnectConfirm}
            </Button>
          )
        }
      />
    </div>
  );
}

/** Disconnect asks once: what stops, and whether the copies go with it. */
function DisconnectSheet({ isOpen, ...form }: DisconnectSheetProps) {
  return (
    <FormSheet
      isOpen={isOpen}
      onClose={form.onClose}
      title={HELM_COPY.connectionDisconnect(form.accountName ?? form.appName)}
    >
      {isOpen && <DisconnectForm {...form} />}
    </FormSheet>
  );
}

export default DisconnectSheet;
