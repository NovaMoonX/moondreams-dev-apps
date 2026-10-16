import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useOnTabReturn } from '@/hooks/useOnTabReturn';
import { generateUuid } from '@/utils';
import { hasDialogOnTop } from '@/utils/dialogUtils';
import { MAX_COOK_TIMERS } from '@apps/pinch/constants';
import {
  canStartTimer,
  countLiveTimers,
  getAlertRepeatsDue,
  getEndedAts,
  getFocusAfterDismiss,
  getFocusAfterFinish,
  getFocusedTimerId,
  getNextAlertRepeatAt,
  getTimerCaption,
  getTimerSlotKey,
  type AlertRing,
  type TimerFocus,
} from '@apps/pinch/utils/cooks';

interface TimerBase {
  id: string;
  recipeId: string;
  /** Named on screen only when the session cooks several recipes. */
  recipeTitle: string | null;
  /** As the person reads it, starting at 1. */
  stepNumber: number;
  /** The step's first words, what the timer is called on screen. */
  stepName: string;
  label: string;
  /** The whole length it was started with, for the progress bar. */
  durationMs: number;
}

export type CookTimer = TimerBase &
  (
    | { status: 'running'; endsAt: number; startedAt: number }
    | { status: 'paused'; remainingMs: number }
    /** `endedAt` is when it rang (its deadline), which orders Time's ups and says how long ago one rang. */
    | { status: 'done'; endedAt: number }
  );

type Notice = 'unseen' | 'showing' | 'seen';

const UNFOCUSED: TimerFocus = { isShown: false, pickedId: null };

const BEEP_OFFSETS_SECONDS = [0, 0.4, 0.8];
const SETTLE_SLACK_MS = 20;

const isLive = (timer: CookTimer) => timer.status !== 'done';

const baseOf = (timer: CookTimer): TimerBase => ({
  id: timer.id,
  recipeId: timer.recipeId,
  recipeTitle: timer.recipeTitle,
  stepNumber: timer.stepNumber,
  stepName: timer.stepName,
  label: timer.label,
  durationMs: timer.durationMs,
});

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

/** Timers kept in memory only, and which one the timer view shows (`focused`, null while they run in the background). Each runs to a clock deadline, so a throttled or hidden tab doesn't stretch it; a finished one comes into focus, buzzes and beeps, and toasts only while the screen is hidden or covered. */
export function useCookTimers() {
  const { addToast } = useToast();
  const [timers, setTimers] = useState<CookTimer[]>([]);
  const [notice, setNotice] = useState<Notice>('unseen');
  const [focus, setFocus] = useState<TimerFocus>(UNFOCUSED);
  const [finishedSlots, setFinishedSlots] = useState<string[]>([]);
  const timersRef = useRef<CookTimer[]>([]);
  const addToastRef = useRef(addToast);
  const audioRef = useRef<AudioContext | null>(null);
  const ringsRef = useRef(new Map<string, AlertRing>());

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

  const playAlert = useCallback(() => {
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

  const alertDone = useCallback(
    (finished: CookTimer[]) => {
      if (document.visibilityState === 'hidden' || hasDialogOnTop()) {
        finished.forEach((timer) =>
          addToastRef.current({
            title: 'Timer done',
            description: `${getTimerCaption(timer)} · ${timer.label}`,
            type: 'success',
            duration: 10_000,
          }),
        );
      }
      playAlert();
    },
    [playAlert],
  );

  const settle = useCallback(() => {
    const now = Date.now();
    const finished = timersRef.current.filter(
      (timer) => timer.status === 'running' && timer.endsAt <= now,
    );
    if (finished.length === 0) {
      return;
    }

    const lastEndedAt = timersRef.current.reduce(
      (latest, timer) =>
        timer.status === 'done' ? Math.max(latest, timer.endedAt) : latest,
      0,
    );
    const endedAts = getEndedAts(
      finished.flatMap((timer) =>
        timer.status === 'running'
          ? [{ id: timer.id, endsAt: timer.endsAt }]
          : [],
      ),
      lastEndedAt,
    );
    commit(
      timersRef.current.map((timer): CookTimer => {
        const endedAt = endedAts.get(timer.id);
        return endedAt === undefined
          ? timer
          : { ...baseOf(timer), status: 'done', endedAt };
      }),
    );
    finished.forEach((timer) =>
      ringsRef.current.set(timer.id, {
        id: timer.id,
        lastAt: now,
        repeats: 0,
      }),
    );
    setFocus(getFocusAfterFinish);
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

  const waitingIds = timers
    .filter((timer) => timer.status === 'done')
    .map((timer) => timer.id)
    .join(',');

  useEffect(() => {
    if (waitingIds === '') {
      return;
    }

    const rings = () =>
      waitingIds.split(',').flatMap((id) => ringsRef.current.get(id) ?? []);
    let timeoutId = 0;
    const arm = () => {
      const at = getNextAlertRepeatAt(rings());
      if (at === null) {
        return;
      }
      timeoutId = window.setTimeout(
        repeat,
        Math.max(0, at - Date.now()) + SETTLE_SLACK_MS,
      );
    };
    const repeat = () => {
      const now = Date.now();
      const due = getAlertRepeatsDue(rings(), now);
      due.forEach((id) => {
        const ring = ringsRef.current.get(id);
        if (ring) {
          ringsRef.current.set(id, {
            ...ring,
            lastAt: now,
            repeats: ring.repeats + 1,
          });
        }
      });
      if (due.length > 0 && !hasDialogOnTop()) {
        playAlert();
      }
      arm();
    };
    arm();
    return () => window.clearTimeout(timeoutId);
  }, [waitingIds, playAlert]);

  /** Starts a timer and brings it into focus; returns its id, or null at the cap. */
  const start = (
    base: Omit<TimerBase, 'id' | 'label' | 'durationMs'>,
    seconds: number,
    label: string,
  ) => {
    if (!canStartTimer(timersRef.current)) {
      return null;
    }

    prepareSound();
    const now = Date.now();
    const id = generateUuid();
    commit(
      dropOldFinished([
        ...timersRef.current,
        {
          ...base,
          id,
          label,
          durationMs: seconds * 1000,
          status: 'running',
          startedAt: now,
          endsAt: now + seconds * 1000,
        },
      ]),
    );
    setFinishedSlots((current) =>
      current.filter((key) => key !== getTimerSlotKey({ ...base, label })),
    );
    setFocus({ isShown: true, pickedId: id });
    setNotice((current) => (current === 'unseen' ? 'showing' : current));
    return id;
  };

  const pause = (id: string) => {
    const now = Date.now();
    commit(
      timersRef.current.map((timer): CookTimer =>
        timer.id === id && timer.status === 'running'
          ? {
              ...baseOf(timer),
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
              ...baseOf(timer),
              status: 'running',
              startedAt: now,
              endsAt: now + timer.remainingMs,
            }
          : timer,
      ),
    );
  };

  /** Ends a timer (Reset when paused, Dismiss when done); the timer view then shows another finished one or the one still picked, else closes. A dismissed Time's up leaves its slot in `finishedSlots`. */
  const dismiss = (id: string) => {
    const before = timersRef.current;
    const ended = before.find((timer) => timer.id === id);
    const next = before.filter((timer) => timer.id !== id);
    ringsRef.current.delete(id);
    commit(next);
    if (ended?.status === 'done') {
      const key = getTimerSlotKey(ended);
      setFinishedSlots((current) =>
        current.includes(key) ? current : [...current, key],
      );
    }
    setFocus((current) => getFocusAfterDismiss(before, current, id));
    if (next.length === 0) {
      setNotice((current) => (current === 'showing' ? 'seen' : current));
    }
  };

  const focusTimer = (id: string) => {
    if (timersRef.current.some((timer) => timer.id === id)) {
      setFocus({ isShown: true, pickedId: id });
    }
  };

  const unfocus = () => setFocus(UNFOCUSED);

  const clear = () => {
    ringsRef.current.clear();
    commit([]);
    setFinishedSlots([]);
    setFocus(UNFOCUSED);
    setNotice((current) => (current === 'showing' ? 'seen' : current));
  };

  const finishedSlotSet = useMemo(
    () => new Set(finishedSlots),
    [finishedSlots],
  );
  const liveCount = countLiveTimers(timers);
  const focusedId = focus.isShown
    ? getFocusedTimerId(timers, focus.pickedId)
    : null;
  const focused = timers.find((timer) => timer.id === focusedId) ?? null;

  return {
    timers,
    liveCount,
    focused,
    /** Slots of times that finished and were dismissed, for this session only. */
    finishedSlots: finishedSlotSet,
    isFull: !canStartTimer(timers),
    isNoticeShown: notice === 'showing',
    settle,
    start,
    /** Readies the Time's up sound; call it from a tap, since browsers only start sound after one. `start` calls it too. */
    prepareSound,
    pause,
    resume,
    dismiss,
    focus: focusTimer,
    unfocus,
    clear,
  };
}
