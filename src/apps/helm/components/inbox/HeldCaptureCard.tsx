import { useEffect, useState, useSyncExternalStore } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DeleteIconButton from '@/components/DeleteIconButton';
import DetailSheet from '@/components/DetailSheet';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { formatDate, formatTime } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  isSorting,
  isUnreachable,
  subscribeSorting,
} from '@apps/helm/queries/nomosMutations';
import {
  deleteCapture,
  loadExecutionsById,
  makeTaskAsWritten,
  retryCapture,
  sortRestOfCapture,
} from '@apps/helm/store/actions/captureActions';
import { selectExecutionsById } from '@apps/helm/store/selectors/captureSelectors';
import {
  canMakeTaskAsWritten,
  getFailedCause,
  getLimitResetTime,
  getWaitingReason,
  type HeldItem,
} from '@apps/helm/utils/heldCaptures';
import type { HeldReason } from '@apps/helm/types';

interface HeldCaptureCardProps {
  item: HeldItem | null;
  onClose: () => void;
}

function toHeldToast(heldReason: HeldReason | null) {
  if (heldReason === 'dailyLimit') {
    return HELM_COPY.savedHeldDaily(getLimitResetTime());
  }
  if (heldReason === 'budgetReached') return HELM_COPY.savedHeldBudget;
  return HELM_COPY.sortRestUnavailable;
}

function getReasonLine(item: HeldItem, name: string, isUnreachable: boolean) {
  if (item.kind === 'couldNotRead') return HELM_COPY.couldNotRead;
  if (item.kind === 'moreToSort') return HELM_COPY.moreToSort;
  if (item.kind === 'waiting') {
    return getWaitingReason(item.capture, isUnreachable);
  }
  return `${HELM_COPY.couldNotSort}. ${getFailedCause(item.capture.lastErrorCode, name)}`;
}

/** The sheet of one turn that waits or needs the person: its words, why, and a way to move on that never loses the words. */
function HeldCaptureCard({ item, onClose }: HeldCaptureCardProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const name = useAssistantName();
  const [openedAt] = useState(Date.now);
  const captureId = item?.capture.id ?? null;
  const isSortingHere = useSyncExternalStore(subscribeSorting, () =>
    captureId === null ? false : isSorting(captureId),
  );
  const isUnreachableHere = useSyncExternalStore(subscribeSorting, () =>
    captureId === null ? false : isUnreachable(captureId),
  );
  const executionsById = useAppSelector(selectExecutionsById);
  const executionIds = item?.capture.executionIds ?? [];
  const missingKey = executionIds
    .filter((id) => !executionsById.has(id))
    .join(',');
  const uid = user?.uid;
  useEffect(() => {
    if (uid && missingKey) void loadExecutionsById(uid, missingKey.split(','));
  }, [uid, missingKey]);
  const isFiledKnown = executionIds.every((id) => executionsById.has(id));
  const filedCount = isFiledKnown
    ? executionIds.reduce(
        (total, id) =>
          total +
          (executionsById
            .get(id)
            ?.effectRefs.filter((ref) => ref.op === 'create').length ?? 0),
        0,
      )
    : null;

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
              (isTakenBack) =>
                addToast(
                  isTakenBack
                    ? { title: HELM_COPY.tookBackTask, type: 'info' }
                    : { title: HELM_COPY.cannotTakeBack, type: 'info' },
                ),
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

  const sortRest = async () => {
    if (!item) return;
    const { kind, heldReason } = await sortRestOfCapture(item.capture.id);
    if (kind === 'done') {
      onClose();
      return;
    }
    if (kind === 'skipped') return;
    addToast({
      title: toHeldToast(kind === 'held' ? heldReason : null),
      type: 'info',
    });
  };

  const remove = async () => {
    if (!user || !item) return;
    const isConfirmed = await confirm({
      title: HELM_COPY.deleteCaptureTitle,
      message:
        item.capture.executionIds.length > 0
          ? HELM_COPY.deleteCaptureBodyMade
          : HELM_COPY.deleteCaptureBody,
      confirmText: HELM_COPY.deleteCapture,
      destructive: true,
    });
    if (!isConfirmed) return;
    void deleteCapture(user.uid, item.capture.id).catch(reportFailure);
    onClose();
  };

  const canMakeTask =
    item !== null &&
    !item.capture.isUnreadable &&
    item.kind !== 'moreToSort' &&
    canMakeTaskAsWritten(item.capture, isSortingHere, openedAt);

  return (
    <DetailSheet
      isOpen={item !== null}
      onClose={onClose}
      title={HELM_COPY.turnSheetTitle}
      footer={
        item && (
          <div className='flex items-center gap-2'>
            <DeleteIconButton
              label={HELM_COPY.deleteCapture}
              onClick={() => void remove()}
            />
            {item.kind === 'moreToSort' && (
              <Button
                type='button'
                className='flex-1'
                disabled={isSortingHere}
                onClick={() => void sortRest()}
              >
                {HELM_COPY.sortTheRest}
              </Button>
            )}
            {canMakeTask && (
              <Button
                type='button'
                className='flex-1'
                onClick={() => void makeTask()}
              >
                {HELM_COPY.makeTaskAsWritten}
              </Button>
            )}
          </div>
        )
      }
    >
      {item && (
        <div className='space-y-3'>
          <p className='bg-muted/60 rounded-[10px] px-3.5 py-2.5 text-[15px] leading-[21px] break-words whitespace-pre-wrap'>
            {item.capture.isUnreadable
              ? HELM_COPY.unreadable
              : item.capture.text}
          </p>
          {(item.kind === 'failed' || item.kind === 'couldNotRead') && (
            <Button type='button' variant='secondary' size='sm' onClick={retry}>
              {HELM_COPY.tryReadingAgain}
            </Button>
          )}
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {getReasonLine(item, name, isUnreachableHere)}
            <span className='whitespace-nowrap tabular-nums'>
              {' · '}
              {formatDate(item.capture.createdAt)},{' '}
              {formatTime(item.capture.createdAt)}
            </span>
          </p>
          {item.kind === 'moreToSort' && (
            <p className='text-muted-foreground text-[13px] text-pretty'>
              {HELM_COPY.moreToSortFiled(filedCount || null)}
            </p>
          )}
        </div>
      )}
    </DetailSheet>
  );
}

export default HeldCaptureCard;
