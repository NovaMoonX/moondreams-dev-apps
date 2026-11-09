import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DeleteIconButton from '@/components/DeleteIconButton';
import DetailSheet from '@/components/DetailSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { formatDate, formatTime } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  deleteCapture,
  makeTaskAsWritten,
  retryCapture,
  sortRestOfCapture,
} from '@apps/helm/store/actions/captureActions';
import {
  getFailedCause,
  getWaitingReason,
  type HeldItem,
} from '@apps/helm/utils/heldCaptures';

interface HeldCaptureCardProps {
  item: HeldItem | null;
  onClose: () => void;
}

function getReasonLine(item: HeldItem, name: string) {
  if (item.kind === 'couldNotRead') return HELM_COPY.couldNotRead;
  if (item.kind === 'moreToSort') return HELM_COPY.moreToSort;
  if (item.kind === 'waiting') return getWaitingReason(item.capture);
  return `${HELM_COPY.couldNotSort}. ${getFailedCause(item.capture.lastErrorCode, name)}`;
}

/** The sheet of one turn that waits or needs the person: its words, why, and a way to move on that never loses the words. */
function HeldCaptureCard({ item, onClose }: HeldCaptureCardProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const name = useAssistantName();

  const reportFailure = (error: unknown) => {
    console.error('Helm held turn action failed', error);
    addToast({ title: HELM_COPY.heldActionFailed, type: 'error' });
  };

  const makeTask = async () => {
    if (!user || !item) return;
    try {
      const { write, undo } = await makeTaskAsWritten(
        user.uid,
        await getHelmEncryption(user.uid),
        item.capture,
      );
      write.catch(reportFailure);
      addToast({
        title: HELM_COPY.madeTask,
        type: 'success',
        action: {
          label: HELM_COPY.undo,
          onClick: () =>
            void undo().then(
              () => addToast({ title: HELM_COPY.tookBackTask, type: 'info' }),
              reportFailure,
            ),
        },
      });
      onClose();
    } catch (error) {
      reportFailure(error);
    }
  };

  const retry = () => {
    if (!user || !item) return;
    void retryCapture(user.uid, item.capture).catch(reportFailure);
    onClose();
  };

  const sortRest = () => {
    if (!item) return;
    void sortRestOfCapture(item.capture.id);
    onClose();
  };

  const remove = async () => {
    if (!user || !item) return;
    const isConfirmed = await confirm({
      title: HELM_COPY.deleteCaptureTitle,
      message: HELM_COPY.deleteCaptureBody,
      confirmText: HELM_COPY.deleteCapture,
      destructive: true,
    });
    if (!isConfirmed) return;
    void deleteCapture(user.uid, item.capture.id).catch(reportFailure);
    onClose();
  };

  return (
    <DetailSheet
      isOpen={item !== null}
      onClose={onClose}
      title={HELM_COPY.turnSheetTitle}
      footer={
        item && (
          <ModalFooterActions
            leftActions={
              <DeleteIconButton
                label={HELM_COPY.deleteCapture}
                onClick={() => void remove()}
              />
            }
            rightActions={
              !item.capture.isUnreadable &&
              item.kind !== 'moreToSort' && (
                <Button type='button' onClick={() => void makeTask()}>
                  {HELM_COPY.makeTaskAsWritten}
                </Button>
              )
            }
          />
        )
      }
    >
      {item && (
        <div className='space-y-3'>
          <p className='helm-card px-3.5 py-2.5 text-[15px] leading-[21px] break-words whitespace-pre-wrap'>
            {item.capture.isUnreadable
              ? HELM_COPY.unreadable
              : item.capture.text}
          </p>
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {getReasonLine(item, name)}
          </p>
          <p className='text-muted-foreground text-[13px] tabular-nums'>
            {formatDate(item.capture.createdAt)},{' '}
            {formatTime(item.capture.createdAt)}
          </p>
          {(item.kind === 'failed' || item.kind === 'couldNotRead') && (
            <Button type='button' variant='secondary' size='sm' onClick={retry}>
              {HELM_COPY.tryReadingAgain}
            </Button>
          )}
          {item.kind === 'moreToSort' && (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={sortRest}
            >
              {HELM_COPY.sortTheRest}
            </Button>
          )}
        </div>
      )}
    </DetailSheet>
  );
}

export default HeldCaptureCard;
