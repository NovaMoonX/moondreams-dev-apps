import { useEffect, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import LazyMount from '@/components/LazyMount';
import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch, useAppSelector } from '@/store';
import { formatTime } from '@/utils/formatUtils';
import ActorMark from '@apps/helm/components/activity/ActorMark';
import ExecutionSheet from '@apps/helm/components/activity/ExecutionSheet';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import {
  clearActivity,
  setActivity,
  setActivityFailed,
  showMoreActivity,
} from '@apps/helm/store/helmSlice';
import { startActivityListener } from '@apps/helm/store/listeners/executionListener';
import type { OpenExecution } from '@apps/helm/types';
import {
  formatDayHeading,
  getActivityLine,
  groupByDay,
} from '@apps/helm/utils/activity';
import { createSealedReader } from '@lib/security';

interface ActivityScreenProps {
  onBack: () => void;
}

const ROW_ESTIMATED_HEIGHT = 48;

/** Listens to the newest executions while the screen is open, restarting with a larger window each time the foot is reached. */
function useActivityFeed(uid: string | null, limit: number) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!uid) return;
    let isCurrent = true;
    const stops: (() => void)[] = [];
    getHelmEncryption(uid)
      .then((encryption) => {
        if (!isCurrent) return;
        stops.push(
          startActivityListener(
            uid,
            createSealedReader(encryption, openJson),
            limit,
            (items) => dispatch(setActivity(items)),
            (error) => {
              console.error('Helm activity list failed', error);
              dispatch(setActivityFailed());
            },
          ),
        );
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        console.error('Helm activity could not start', error);
        dispatch(setActivityFailed());
      });
    return () => {
      isCurrent = false;
      stops.forEach((stop) => stop());
    };
  }, [uid, limit, dispatch]);

  useEffect(() => () => void dispatch(clearActivity()), [dispatch]);
}

/** Mounts when scrolled near the foot and asks for the next page. */
function ActivityLoader({ limit }: { limit: number }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(showMoreActivity(limit));
  }, [dispatch, limit]);

  return (
    <p className='text-muted-foreground text-center text-[13px]' role='status'>
      {HELM_COPY.activityLoadingMore}
    </p>
  );
}

function ActivityRow({
  execution,
  onOpen,
}: {
  execution: OpenExecution;
  onOpen: () => void;
}) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto w-full items-center justify-between gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      onClick={onOpen}
    >
      <ActorMark actor={execution.actor} />
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block text-[15px] leading-[21px] break-words'>
          {getActivityLine(execution)}
        </span>
        {execution.undoneByExecutionId !== null && (
          <span className='text-muted-foreground block text-[13px]'>
            {HELM_COPY.takenBackLabel}
          </span>
        )}
      </span>
      <span className='text-muted-foreground shrink-0 text-[13px] whitespace-nowrap tabular-nums'>
        {formatTime(execution.createdAt)}
      </span>
      <ChevronRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

/** A utility screen: every execution newest first under its day, thirty at a time. */
function ActivityScreen({ onBack }: ActivityScreenProps) {
  const { user } = useAuth();
  const name = useAssistantName();
  const now = useNow(60_000);
  const { items, isLoaded, isFailed, limit, isExhausted } = useAppSelector(
    (state) => state.helm.activity,
  );
  const [openId, setOpenId] = useState<string | null>(null);
  useActivityFeed(user?.uid ?? null, limit);

  return (
    <>
      <main className='flex flex-1 flex-col gap-6'>
        <HelmHeader
          backLabel='Settings'
          onBack={onBack}
          onHome={onBack}
          showsHome={false}
        />
        <h1 className='helm-serif text-[28px] leading-[34px]'>
          {HELM_COPY.activityTitle}
        </h1>
        {isFailed && (
          <p className='helm-card p-4 text-[15px] text-pretty' role='alert'>
            {HELM_COPY.activityFailed}
          </p>
        )}
        {!isLoaded && !isFailed && (
          <p className='text-muted-foreground text-[13px]' role='status'>
            {HELM_COPY.activityLoading}
          </p>
        )}
        {isLoaded && items.length === 0 && (
          <p className='helm-card p-4 text-[15px] text-pretty'>
            {HELM_COPY.activityEmpty(name)}
          </p>
        )}
        {groupByDay(items).map((day) => (
          <section key={day.dayStart} className='flex flex-col gap-3'>
            <SectionDivider label={formatDayHeading(day.dayStart, now)} />
            <ul className='helm-card divide-border divide-y overflow-hidden'>
              {day.items.map((execution) => (
                <li key={execution.id}>
                  <ActivityRow
                    execution={execution}
                    onOpen={() => setOpenId(execution.id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {isLoaded && !isFailed && !isExhausted && items.length > 0 && (
          <LazyMount key={items.length} estimatedHeight={ROW_ESTIMATED_HEIGHT}>
            <ActivityLoader limit={limit} />
          </LazyMount>
        )}
      </main>
      <ExecutionSheet executionId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

export default ActivityScreen;
