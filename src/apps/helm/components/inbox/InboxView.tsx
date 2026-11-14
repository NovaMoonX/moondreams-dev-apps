import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { formatDate, formatTime } from '@/utils/formatUtils';
import HeldCaptureCard from '@apps/helm/components/inbox/HeldCaptureCard';
import QuestionSheet from '@apps/helm/components/home/QuestionSheet';
import HeldRow from '@apps/helm/components/inbox/HeldRow';
import TurnCard from '@apps/helm/components/home/TurnCard';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';
import {
  canClearFromNeedsYou,
  clearNeedsYou,
  markAllSeen,
  markCaptureSeen,
} from '@apps/helm/store/actions/captureActions';
import {
  selectAllCaptures,
  selectHeldItems,
  selectNewSinceLooked,
} from '@apps/helm/store/selectors/captureSelectors';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import type { OpenCapture } from '@apps/helm/types';
import { getJoinedOf } from '@apps/helm/utils/sessions';

interface InboxViewProps {
  onBack: () => void;
  onHome: () => void;
}

/** Needs you: the turns said since the person last looked, newest first. Opening one marks it seen. */
function InboxView({ onBack, onHome }: InboxViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const name = useAssistantName();
  const unseen = useAppSelector(selectNewSinceLooked);
  const held = useAppSelector(selectHeldItems);
  const allCaptures = useAppSelector(selectAllCaptures);
  const { isLoaded, isFailed } = useAppSelector(
    (state) => state.helm.unseenCaptures,
  );
  const isWaitingFailed = useAppSelector(
    (state) => state.helm.waitingCaptures.isFailed,
  );
  const [opened, setOpened] = useState<OpenCapture | null>(null);
  const [heldId, setHeldId] = useState<string | null>(null);
  const openHeld =
    [...held.needsYou, ...held.waiting].find(
      (item) => item.capture.id === heldId,
    ) ?? null;

  const reportFailure = (error: unknown) => {
    console.error('Helm turn was not marked seen', error);
    addToast({ title: HELM_COPY.seenFailed, type: 'error' });
  };

  const open = (capture: OpenCapture) => {
    if (!user) return;
    setOpened(capture);
    markCaptureSeen(user.uid, capture.id).catch(reportFailure);
  };

  const clearable = held.needsYou
    .map((item) => item.capture)
    .filter(canClearFromNeedsYou);

  const clearAll = async () => {
    if (!user) return;
    const isConfirmed = await confirm({
      title: HELM_COPY.clearNeedsYouTitle(
        clearable.length,
        held.needsYou.length,
      ),
      message: HELM_COPY.clearNeedsYouBody(
        held.needsYou.some(({ capture }) =>
          Object.values(capture.questionState).some(
            (state) =>
              state.answeredAt === null && state.kind === 'whichIsTrue',
          ),
        ),
      ),
      confirmText: HELM_COPY.clearNeedsYou,
    });
    if (!isConfirmed) return;
    clearNeedsYou(user.uid, clearable).catch((error: unknown) => {
      console.error('Helm Needs you was not cleared', error);
      addToast({ title: HELM_COPY.heldActionFailed, type: 'error' });
    });
  };

  const markEverythingSeen = () => {
    if (!user) return;
    markAllSeen(
      user.uid,
      unseen.map((capture) => capture.id),
    ).catch(reportFailure);
  };

  return (
    <>
      <HelmHeader backLabel='Home' onBack={onBack} onHome={onHome} />
      <main className='space-y-4 pt-4'>
        <h1 className='helm-serif text-[28px] leading-[34px]'>
          {HELM_COPY.inboxTitle}
        </h1>
        {isWaitingFailed && (
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.waitingCheckFailed}
          </p>
        )}
        {clearable.length >= 2 && (
          <div className='flex justify-end'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              rounded='full'
              className="relative before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
              onClick={() => void clearAll()}
            >
              {HELM_COPY.clearNeedsYou}
            </Button>
          </div>
        )}
        {held.needsYou.length > 0 && (
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {held.needsYou.map((item) => (
              <li key={item.capture.id}>
                <HeldRow
                  item={item}
                  joined={getJoinedOf(item.capture, allCaptures)}
                  onOpen={(entry) => setHeldId(entry.capture.id)}
                />
              </li>
            ))}
          </ul>
        )}
        {held.waiting.length > 0 && (
          <>
            <SectionDivider label={HELM_COPY.waitingHeading} />
            <ul className='helm-card divide-border divide-y overflow-hidden'>
              {held.waiting.map((item) => (
                <li key={item.capture.id}>
                  <HeldRow
                    item={item}
                    joined={getJoinedOf(item.capture, allCaptures)}
                    onOpen={(entry) => setHeldId(entry.capture.id)}
                  />
                </li>
              ))}
            </ul>
            <p className='text-muted-foreground text-[13px] text-pretty'>
              {HELM_COPY.waitingNote(name)}
            </p>
          </>
        )}
        <SectionDivider
          label={HELM_COPY.inboxNewSince}
          trailing={
            unseen.length >= 2 && (
              <Button
                type='button'
                variant='secondary'
                size='sm'
                rounded='full'
                onClick={markEverythingSeen}
              >
                {HELM_COPY.markAllSeen}
              </Button>
            )
          }
        />
        {isFailed && !isLoaded && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.turnsFailed}
          </p>
        )}
        {isLoaded && unseen.length === 0 && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.inboxEmpty}
          </p>
        )}
        {unseen.length > 0 && (
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {unseen.map((capture) => (
              <li key={capture.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  className='flex h-auto w-full items-center justify-between gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
                  onClick={() => open(capture)}
                >
                  <span className='size-4 shrink-0' aria-hidden='true' />
                  <span className='min-w-0 flex-1'>
                    <span className='text-foreground line-clamp-2 text-[15px] leading-[21px] break-words'>
                      {capture.isUnreadable
                        ? HELM_COPY.unreadable
                        : capture.text}
                    </span>
                    <span className='text-muted-foreground block text-[13px] tabular-nums'>
                      {formatDate(capture.createdAt)},{' '}
                      {formatTime(capture.createdAt)}
                    </span>
                  </span>
                  <ChevronRight
                    className='text-muted-foreground size-4 shrink-0'
                    aria-hidden='true'
                  />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </main>
      <HeldCaptureCard
        item={openHeld?.kind === 'question' ? null : openHeld}
        onClose={() => setHeldId(null)}
      />
      <QuestionSheet
        item={openHeld?.kind === 'question' ? openHeld : null}
        onClose={() => setHeldId(null)}
      />
      <DetailSheet
        isOpen={opened !== null}
        onClose={() => setOpened(null)}
        title={HELM_COPY.turnSheetTitle}
      >
        {opened && (
          <TurnCard
            showsOutcome
            showsReading
            isOnHome={false}
            showsNotice={false}
            capture={opened}
            joined={getJoinedOf(opened, allCaptures)}
          />
        )}
      </DetailSheet>
    </>
  );
}

export default InboxView;
