import type { FallbackCause } from '@/lib/fallbacks/fallbacks';

/** The stage a cloud listen failed at, one stable name each, so a debug notice and a check read the same words. */
export const CLOUD_LISTEN_STAGES = {
  tokenRequest: 'token request',
  tokenRefused: 'token refused by the server',
  tokenTimeout: 'token wait timed out',
  tokenHeld: 'token held by a limit',
  microphoneOpen: 'microphone open',
  microphoneCapture: 'microphone capture',
  socketOpenTimeout: 'socket open timed out',
  socketError: 'socket error before open',
  socketClosed: 'socket closed before open',
} as const;

/** Why the cloud could not take a listen: the stage, the raw error, and the numbers that explain it (a limit waited, a close code). Never a token or the person's words. */
export interface CloudListenCause extends FallbackCause {
  facts: string[];
}
