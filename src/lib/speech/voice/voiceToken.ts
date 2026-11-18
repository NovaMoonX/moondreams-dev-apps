import type { FallbackCause } from '@/lib/fallbacks/fallbacks';
import { describeThrown } from '@/lib/speech/speechDiagnostics';
import { CLOUD_LISTEN_STAGES } from '@/lib/speech/voice/cloudListenStages';
import type { CloudHeldReason } from '@/lib/speech/voice/types';

const MAX_CLOSED_REPORTS = 10;

interface ClosedReport {
  mintId: string;
  ms: number;
}

export interface MintVoiceTokenRequest {
  appId: string;
  timeZone: string;
  closed: ClosedReport[];
}

export type MintVoiceTokenResult =
  | {
      status: 'ready';
      token: string;
      expiresAt: number;
      provider: 'deepgram';
      model: string;
      mintId: string;
    }
  | { status: 'held'; reason: CloudHeldReason }
  | {
      status: 'held';
      reason: 'unavailable';
      /** A short non-secret code for why the server was unavailable (no key, the provider's status). */
      detail?: string;
    };

export type VoiceTokenAnswer =
  | {
      status: 'ready';
      token: string;
      expiresAt: number;
      model: string;
      mintId: string;
    }
  | { status: 'held'; reason: CloudHeldReason }
  | { status: 'held'; reason: 'unavailable'; cause: FallbackCause };

export interface VoiceTokenSource {
  getToken: () => Promise<VoiceTokenAnswer>;
  /** Tells the server how long a finished stream ran; sent with the next token request. */
  reportClosed: (mintId: string, ms: number) => void;
}

const AUTH_CODES = [
  'unauthenticated',
  'permission-denied',
  'failed-precondition',
];

const toRequestFailure = (error: unknown): FallbackCause => {
  const { code } = (error ?? {}) as { code?: unknown };
  const name = typeof code === 'string' ? code.replace('functions/', '') : '';
  const hint = AUTH_CODES.includes(name)
    ? 'sign-in or App Check looks involved'
    : 'no sign of sign-in or App Check being involved';
  return {
    stage: CLOUD_LISTEN_STAGES.tokenRequest,
    detail: `${typeof code === 'string' ? `${code} ` : ''}${describeThrown(error)} (${hint})`,
  };
};

/** Asks the server for a short-lived listening token; a failed request reads as held `unavailable`. */
export const createVoiceTokenSource = ({
  appId,
  mint,
}: {
  appId: string;
  mint: (request: MintVoiceTokenRequest) => Promise<MintVoiceTokenResult>;
}): VoiceTokenSource => {
  const pending = { closed: [] as ClosedReport[] };
  return {
    getToken: async () => {
      const sent = pending.closed.slice(0, MAX_CLOSED_REPORTS);
      try {
        const result = await mint({
          appId,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          closed: sent,
        });
        if (result.status === 'held' && result.reason === 'unavailable') {
          return {
            status: 'held',
            reason: 'unavailable',
            cause: {
              stage: CLOUD_LISTEN_STAGES.tokenRefused,
              detail: `The server answered unavailable: ${result.detail ?? 'no reason given'}`,
            },
          };
        }
        pending.closed = pending.closed.filter(
          (report) => !sent.includes(report),
        );
        if (result.status === 'held') {
          return { status: 'held', reason: result.reason };
        }
        const { token, expiresAt, model, mintId } = result;
        return { status: 'ready', token, expiresAt, model, mintId };
      } catch (error) {
        console.error('Voice token was not minted', error);
        return {
          status: 'held',
          reason: 'unavailable',
          cause: toRequestFailure(error),
        };
      }
    },
    reportClosed: (mintId, ms) => {
      pending.closed = [...pending.closed, { mintId, ms }];
    },
  };
};
