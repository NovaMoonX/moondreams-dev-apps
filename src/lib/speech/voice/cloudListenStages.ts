import type { FallbackCause } from '@/lib/fallbacks/fallbacks';

export const CLOUD_LISTEN_STAGES = {
  tokenRequest: 'token request',
  tokenRefused: 'token refused by the server',
  tokenTimeout: 'token wait timed out',
  tokenHeld: 'token held by a limit',
  microphoneOpen: 'microphone open',
  microphoneCapture: 'microphone capture',
  socketConstruct: 'socket construct',
  listenStart: 'listening did not start',
  socketOpenTimeout: 'socket open timed out',
  socketError: 'socket error before open',
  socketClosed: 'socket closed before open',
  socketDropError: 'socket error while open',
  socketDropped: 'socket dropped while open',
} as const;

/** Never holds a token or the person's words. */
export interface CloudListenCause extends FallbackCause {
  facts: string[];
}
