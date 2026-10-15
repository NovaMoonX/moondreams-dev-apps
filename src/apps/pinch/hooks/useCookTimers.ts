import { useCallback, useEffect, useRef, useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useOnTabReturn } from '@/hooks/useOnTabReturn';
import { generateUuid } from '@/utils';
import { hasDialogOnTop } from '@/utils/dialogUtils';
import { MAX_COOK_TIMERS } from '@apps/pinch/constants';

export type CookTimer = {
  id: string;
  /** As the person reads it, starting at 1. */
  stepNumber: number;
  /** The step's first words, what the timer is called on screen. */
  stepName: string;
  label: string;
} & (
  | { status: 'running'; endsAt: number; startedAt: number }
  | { status: 'paused'; remainingMs: number }
  | { status: 'done' }
);

type Notice = 'unseen' | 'showing' | 'seen';

const BEEP_OFFSETS_SECONDS = [0, 0.4, 0.8];
const SETTLE_SLACK_MS = 20;

const isLive = (timer: CookTimer) => timer.status !== 'done';

const dropOldFinished = (timers: CookTimer[]) => {
  const finishedIds = timers
    .filter((timer) => !isLive(timer))
    .map((timer) => timer.id);
  const stale = new Set(
    finishedIds.slice(0, Math.max(0, finishedIds.length - MAX_COOK_TIMERS)),
  );
  return timers.filter((timer) => !stale.has(timer.id));
};

export const getRemainingMs = (timer: CookTimer, now: number) => {
  if (timer.status === 'running')
    return Math.max(0, timer.endsAt - Math.max(now, timer.startedAt));
  if (timer.status === 'paused') return timer.remainingMs;
  return 0;
};

const playBeeps = (context: AudioContext) =>
  BEEP_OFFSETS_SECONDS.forEach((offset) => {
    const startAt = context.currentTime + offset;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.25, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.25);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.3);
  });

/** Timers kept in memory only. Each runs to a clock deadline, so a throttled or hidden tab doesn't stretch it; a finished one lights its pill, buzzes and beeps, and toasts only while the screen is hidden or covered. */
export function useCookTimers() {
  const { addToast } = useToast();
  const [timers, setTimers] = useState<CookTimer[]>([]);
  const [notice, setNotice] = useState<Notice>('unseen');
  const timersRef = useRef<CookTimer[]>([]);
  const addToastRef = useRef(addToast);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    addToastRef.current = addToast;
  }, [addToast]);

  useEffect(
    () => () => {
      audioRef.current?.close().catch(() => undefined);
      audioRef.current = null;
    },
    [],
  );

  const commit = useCallback((next: CookTimer[]) => {
    timersRef.current = next;
    setTimers(next);
  }, []);

  const prepareSound = () => {
    try {
      if (typeof AudioContext === 'undefined') return;
      const context = audioRef.current ?? new AudioContext();
      audioRef.current = context;
      context.resume().catch(() => undefined);
    } catch (error) {
      console.error('Timer sound is not available', error);
    }
  };

  const alertDone = useCallback((finished: CookTimer[]) => {
    if (document.visibilityState === 'hidden' || hasDialogOnTop()) {
      finished.forEach((timer) =>
        addToastRef.current({
          title: 'Timer done',
          description: `${timer.stepName} · ${timer.label}`,
          type: 'success',
          duration: 10_000,
        }),
      );
    }
    try {
      if (typeof navigator.vibrate === 'function') {
        navigator.vibrate([200, 100, 200, 100, 200]);
      }
    } catch (error) {
      console.error('Timer buzz is not available', error);
    }
    try {
      audioRef.current?.resume().catch(() => undefined);
      if (audioRef.current) playBeeps(audioRef.current);
    } catch (error) {
      console.error('Timer sound is not available', error);
    }
  }, []);

  const settle = useCallback(() => {
    const now = Date.now();
    const finished = timersRef.current.filter(
      (timer) => timer.status === 'running' && timer.endsAt <= now,
    );
    if (finished.length === 0) {
      return;
    }

    const finishedIds = new Set(finished.map((timer) => timer.id));
    commit(
      timersRef.current.map((timer): CookTimer =>
        finishedIds.has(timer.id)
          ? {
              id: timer.id,
              stepNumber: timer.stepNumber,
              stepName: timer.stepName,
              label: timer.label,
              status: 'done',
            }
          : timer,
      ),
    );
    alertDone(finished);
  }, [commit, alertDone]);

  const nextDeadline = timers.reduce(
    (soonest, timer) =>
      timer.status === 'running' ? Math.min(soonest, timer.endsAt) : soonest,
    Infinity,
  );

  useEffect(() => {
    if (nextDeadline === Infinity) {
      return;
    }

    let timeoutId = 0;
    const arm = () => {
      timeoutId = window.setTimeout(
        () => (Date.now() < nextDeadline ? arm() : settle()),
        Math.max(0, nextDeadline - Date.now()) + SETTLE_SLACK_MS,
      );
    };
    arm();
    return () => window.clearTimeout(timeoutId);
  }, [nextDeadline, settle]);

  useOnTabReturn(settle);

  const start = (
    stepNumber: number,
    stepName: string,
    seconds: number,
    label: string,
  ) => {
    if (timersRef.current.filter(isLive).length >= MAX_COOK_TIMERS) {
      return;
    }

    prepareSound();
    const now = Date.now();
    commit(
      dropOldFinished([
        ...timersRef.current,
        {
          id: generateUuid(),
          stepNumber,
          stepName,
          label,
          status: 'running',
          startedAt: now,
          endsAt: now + seconds * 1000,
        },
      ]),
    );
    setNotice((current) => (current === 'unseen' ? 'showing' : current));
  };

  const pause = (id: string) => {
    const now = Date.now();
    commit(
      timersRef.current.map((timer): CookTimer =>
        timer.id === id && timer.status === 'running'
          ? {
              id: timer.id,
              stepNumber: timer.stepNumber,
              stepName: timer.stepName,
              label: timer.label,
              status: 'paused',
              remainingMs: getRemainingMs(timer, now),
            }
          : timer,
      ),
    );
  };

  const resume = (id: string) => {
    const now = Date.now();
    commit(
      timersRef.current.map((timer): CookTimer =>
        timer.id === id && timer.status === 'paused'
          ? {
              id: timer.id,
              stepNumber: timer.stepNumber,
              stepName: timer.stepName,
              label: timer.label,
              status: 'running',
              startedAt: now,
              endsAt: now + timer.remainingMs,
            }
          : timer,
      ),
    );
  };

  const dismiss = (id: string) => {
    const next = timersRef.current.filter((timer) => timer.id !== id);
    commit(next);
    if (next.length === 0) {
      setNotice((current) => (current === 'showing' ? 'seen' : current));
    }
  };

  const clear = () => {
    commit([]);
    setNotice((current) => (current === 'showing' ? 'seen' : current));
  };

  const liveCount = timers.filter(isLive).length;

  return {
    timers,
    liveCount,
    isFull: liveCount >= MAX_COOK_TIMERS,
    isNoticeShown: notice === 'showing',
    settle,
    start,
    pause,
    resume,
    dismiss,
    clear,
  };
}
