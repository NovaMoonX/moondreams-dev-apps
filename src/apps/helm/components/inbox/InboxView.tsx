import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { formatDate, formatTime } from '@/utils/formatUtils';
import TurnCard from '@apps/helm/components/home/TurnCard';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';
import {
  markAllSeen,
  markCaptureSeen,
} from '@apps/helm/store/actions/captureActions';
import { selectUnseenCaptures } from '@apps/helm/store/selectors/captureSelectors';
import type { OpenCapture } from '@apps/helm/types';

interface InboxViewProps {
  onBack: () => void;
  onHome: () => void;
}

/** Needs you: the turns said since the person last looked, newest first. Opening one marks it seen. */
function InboxView({ onBack, onHome }: InboxViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const unseen = useAppSelector(selectUnseenCaptures);
  const { isLoaded, isFailed } = useAppSelector(
    (state) => state.helm.unseenCaptures,
  );
  const [opened, setOpened] = useState<OpenCapture | null>(null);

  const reportFailure = (error: unknown) => {
    console.error('Helm turn was not marked seen', error);
    addToast({ title: HELM_COPY.seenFailed, type: 'error' });
  };

  const open = (capture: OpenCapture) => {
    if (!user) return;
    setOpened(capture);
    markCaptureSeen(user.uid, capture.id).catch(reportFailure);
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
      <DetailSheet
        isOpen={opened !== null}
        onClose={() => setOpened(null)}
        title={HELM_COPY.turnSheetTitle}
      >
        {opened && <TurnCard showsOutcome capture={opened} />}
      </DetailSheet>
    </>
  );
}

export default InboxView;
