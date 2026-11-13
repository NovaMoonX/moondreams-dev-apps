import { useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'recording' | 'refused' | 'unsupported';

export interface Recording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  /** True when the recording ended because it reached `maxMs`. */
  isCut: boolean;
}

interface UseAudioRecorderOptions {
  maxMs: number;
  onDone: (recording: Recording) => void;
}

interface Session {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  startedAt: number;
  timer: number;
  isDiscarded: boolean;
  isCut: boolean;
}

const TYPES = ['audio/webm;codecs=opus', 'audio/mp4'];

const pickType = () =>
  typeof MediaRecorder === 'undefined'
    ? null
    : (TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null);

/** Records the microphone with `MediaRecorder` (Opus in WebM, else MP4); a browser that cannot record is `unsupported`, one the person refused `refused`. `start` answers whether it began; `stop` hands the recording to `onDone`, `cancel` drops it; at `maxMs` it stops by itself. The microphone is released on stop, cancel and unmount. */
export function useAudioRecorder({ maxMs, onDone }: UseAudioRecorderOptions) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const session = useRef<Session | null>(null);
  const done = useRef(onDone);
  const isStarting = useRef(false);
  const isMounted = useRef(true);
  useEffect(() => {
    done.current = onDone;
  });

  const release = () => {
    const held = session.current;
    session.current = null;
    if (!held) return;
    window.clearInterval(held.timer);
    held.stream.getTracks().forEach((track) => track.stop());
  };

  useEffect(() => {
    const live = session;
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      const held = live.current;
      if (held) held.isDiscarded = true;
      if (held?.recorder.state === 'recording') held.recorder.stop();
      if (held) {
        window.clearInterval(held.timer);
        held.stream.getTracks().forEach((track) => track.stop());
      }
      live.current = null;
    };
  }, []);

  const start = async (): Promise<boolean> => {
    if (session.current || isStarting.current) return false;
    if (
      typeof MediaRecorder === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setState('unsupported');
      return false;
    }
    isStarting.current = true;
    const acquired: { stream: MediaStream | null } = { stream: null };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      acquired.stream = stream;
      if (!isMounted.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      const type = pickType();
      const recorder = new MediaRecorder(
        stream,
        type ? { mimeType: type } : undefined,
      );
      const startedAt = Date.now();
      const held: Session = {
        recorder,
        stream,
        chunks: [],
        startedAt,
        timer: window.setInterval(() => {
          const spent = Date.now() - startedAt;
          setElapsedMs(Math.min(spent, maxMs));
          if (spent >= maxMs && recorder.state === 'recording') {
            held.isCut = true;
            recorder.stop();
          }
        }, 250),
        isDiscarded: false,
        isCut: false,
      };
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) held.chunks.push(event.data);
      };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || type || 'audio/webm';
        const durationMs = Math.min(Date.now() - held.startedAt, maxMs);
        if (session.current === held) release();
        setState('idle');
        setElapsedMs(0);
        if (!held.isDiscarded) {
          done.current({
            blob: new Blob(held.chunks, { type: mimeType }),
            mimeType,
            durationMs,
            isCut: held.isCut,
          });
        }
      };
      session.current = held;
      setElapsedMs(0);
      setState('recording');
      recorder.start();
      return true;
    } catch {
      acquired.stream?.getTracks().forEach((track) => track.stop());
      release();
      if (isMounted.current) setState('refused');
      return false;
    } finally {
      isStarting.current = false;
    }
  };

  const stop = () => {
    if (session.current?.recorder.state === 'recording') {
      session.current.recorder.stop();
    }
  };

  const cancel = () => {
    const held = session.current;
    if (!held) return;
    held.isDiscarded = true;
    if (held.recorder.state === 'recording') held.recorder.stop();
    else release();
  };

  return { state, elapsedMs, start, stop, cancel };
}
