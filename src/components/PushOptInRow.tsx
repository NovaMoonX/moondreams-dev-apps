import { useState, type ReactNode } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { NOTICE_ACTION_CLASSES } from '@/components/noticeActionClasses';
import ModalFooterActions from '@/components/ModalFooterActions';
import PromptRow from '@/components/PromptRow';
import { useSheetHistory } from '@/hooks/useBackHistory';
import { turnOnDevicePush } from '@/lib/notifications/devicePush';
import {
  getDeviceNotificationsText,
  getTurnOnFailureText,
} from '@/lib/notifications/deviceText';
import {
  devicePushQueryOptions,
  notificationsQueryKeys,
} from '@/lib/notifications/notificationsQueries';

interface PushOptInRowProps {
  uid: string;
  icon: ReactNode;
  /** The row's one plain sentence. */
  title: string;
  /** The small modal's title. */
  modalTitle: string;
  /** What turning it on does, in the app's words. */
  body: ReactNode;
  /** One muted line under the body; the browser's own question is announced here by default. */
  note?: string;
  /** What the modal says once it is done. */
  doneText: string;
  /** Added after the site's line when this browser can't show notifications at all. */
  unsupportedNote?: string;
  /** True while the app's own setting is already on: with a reachable device the row then draws nothing. */
  isSettingOn: boolean;
  /** Called once this device can be reached; saves the app's own setting and says whether it saved. */
  onTurnedOn: () => Promise<boolean>;
  isCompact?: boolean;
  /** Draws the row as a warning-toned footer line for the inside of a card (a hairline above it, no tinted box), with a solid Turn on. */
  isInCard?: boolean;
  actionLabel?: string;
}

/** A quiet row that offers to reach this device with pushes, and a small sheet that asks the browser for permission on its own Turn on tap, then lets the app save its setting. It draws nothing while this device's state is unread, or once it is reachable with the app's setting on. */
function PushOptInRow({
  uid,
  icon,
  title,
  modalTitle,
  body,
  note = 'Your browser will ask first.',
  doneText,
  unsupportedNote,
  isSettingOn,
  onTurnedOn,
  isCompact = true,
  isInCard = false,
  actionLabel = 'Turn on',
}: PushOptInRowProps) {
  const queryClient = useQueryClient();
  const device = useQuery(devicePushQueryOptions(uid)).data ?? null;
  const [isOpen, setIsOpen] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const close = () => {
    setIsOpen(false);
    setIsDone(false);
    setFailure(null);
  };
  const { dialogId, onDialogClose } = useSheetHistory(isOpen, close);

  const turnOn = async () => {
    setFailure(null);
    setIsAsking(true);
    try {
      const result = device === 'on' ? 'on' : await turnOnDevicePush(uid);
      if (result === 'on') {
        setIsDone(await onTurnedOn());
        return;
      }
      setFailure(
        result === 'dismissed'
          ? 'Nothing changed. Tap Turn on when you are ready.'
          : getTurnOnFailureText(result),
      );
    } finally {
      setIsAsking(false);
      await queryClient.invalidateQueries({
        queryKey: notificationsQueryKeys.device(uid),
      });
    }
  };

  const isStuck = device === 'blocked' || device === 'unsupported';
  const stateNote =
    device === 'blocked'
      ? getDeviceNotificationsText('blocked')
      : device === 'unsupported'
        ? [getDeviceNotificationsText('unsupported'), unsupportedNote]
            .filter(Boolean)
            .join(' ')
        : null;
  const shownNote = isDone ? null : (stateNote ?? failure);
  const isHidden = device === null || (device === 'on' && isSettingOn);

  return (
    <>
      {!isHidden &&
        (isInCard ? (
          <div className='border-border flex items-center gap-3 border-t px-4 py-3'>
            <span className='shrink-0' aria-hidden='true'>
              {icon}
            </span>
            <p className='text-warning-foreground dark:text-warning min-w-0 flex-1 text-[13px] font-medium'>
              {title}
            </p>
            <Button
              type='button'
              variant='primary'
              size='sm'
              className={`shrink-0 ${NOTICE_ACTION_CLASSES.warning}`}
              onClick={() => setIsOpen(true)}
            >
              {actionLabel}
            </Button>
          </div>
        ) : (
          <PromptRow
            icon={icon}
            isCompact={isCompact}
            title={title}
            actionLabel={actionLabel}
            onAction={() => setIsOpen(true)}
          />
        ))}
      <Modal
        id={dialogId}
        isOpen={isOpen}
        onClose={onDialogClose}
        title={modalTitle}
        className='border-border border'
      >
        <div className='[&_.form-footer]:bg-popover space-y-3 text-sm [&_.form-footer]:sticky [&_.form-footer]:bottom-0 [&_.form-footer]:-mx-6 [&_.form-footer]:-mb-6 [&_.form-footer]:rounded-b-lg [&_.form-footer]:px-6 [&_.form-footer]:pt-2 [&_.form-footer]:pb-4'>
          {isDone ? (
            <p>{doneText}</p>
          ) : (
            <>
              <div className='space-y-3'>{body}</div>
              <p className='text-muted-foreground text-xs'>{note}</p>
            </>
          )}
          <ModalFooterActions
            note={shownNote}
            cancelAction={
              isDone ? undefined : (
                <Button type='button' variant='secondary' onClick={close}>
                  {isStuck ? 'Close' : 'Not now'}
                </Button>
              )
            }
            rightActions={
              isDone ? (
                <Button type='button' onClick={close}>
                  Done
                </Button>
              ) : (
                <Button
                  type='button'
                  loading={isAsking}
                  disabled={isStuck}
                  onClick={() => void turnOn()}
                >
                  {actionLabel}
                </Button>
              )
            }
          />
        </div>
      </Modal>
    </>
  );
}

export default PushOptInRow;
