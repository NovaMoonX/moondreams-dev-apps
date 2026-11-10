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
  | { status: 'held'; reason: CloudHeldReason | 'unavailable' };

export type VoiceTokenAnswer =
  | {
      status: 'ready';
      token: string;
      expiresAt: number;
      model: string;
      mintId: string;
    }
  | { status: 'held'; reason: CloudHeldReason | 'unavailable' };

export interface VoiceTokenSource {
  getToken: () => Promise<VoiceTokenAnswer>;
  /** Tells the server how long a finished stream ran; sent with the next token request. */
  reportClosed: (mintId: string, ms: number) => void;
}

/** Asks the server for a short-lived listening token (`mint` is the callable, injected). A failed request reads as held `unavailable` and keeps the unsent stream reports. */
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
        pending.closed = pending.closed.filter(
          (report) => !sent.includes(report),
        );
        if (result.status === 'held') return result;
        const { token, expiresAt, model, mintId } = result;
        return { status: 'ready', token, expiresAt, model, mintId };
      } catch (error) {
        console.error('Voice token was not minted', error);
        return { status: 'held', reason: 'unavailable' };
      }
    },
    reportClosed: (mintId, ms) => {
      pending.closed = [...pending.closed, { mintId, ms }];
    },
  };
};
