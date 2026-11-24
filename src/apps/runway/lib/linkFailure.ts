import { BankWindowError } from '@apps/runway/lib/bankLink';

/** A link flow's failure with the step it stopped at; the message stays the cause's sentence. */
export class LinkStepError extends Error {
  readonly step: string;
  readonly cause: unknown;
  constructor(step: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'LinkStepError';
    this.step = step;
    this.cause = cause;
  }
}

/** Runs one step of a link flow, tagging a failure with the step's name. */
export async function inLinkStep<T>(
  step: string,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw new LinkStepError(step, error);
  }
}

const readDetails = (error: unknown): Record<string, unknown> | null => {
  if (typeof error !== 'object' || error === null) return null;
  const details = (error as { details?: unknown }).details;
  return typeof details === 'object' && details !== null
    ? (details as Record<string, unknown>)
    : null;
};

const readCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
};

/** What a debug viewer needs to tell a link failure apart: the step, the error kind, the provider's code and ids. Holds no token, amount or account. */
export function readLinkFailureFacts(error: unknown): string[] {
  const step = error instanceof LinkStepError ? error.step : null;
  const cause = error instanceof LinkStepError ? error.cause : error;
  if (cause instanceof BankWindowError) {
    return [...(step ? [`Step: ${step}`] : []), ...cause.facts];
  }
  const details = readDetails(cause);
  const pairs: [string, unknown][] = [
    ['Step', step],
    ['Error', cause instanceof Error ? cause.name : typeof cause],
    ['Code', readCode(cause)],
    ['Provider code', details?.providerCode],
    ['Provider call', details?.path],
    ['Provider request', details?.requestId],
    [
      'Online',
      typeof navigator?.onLine === 'boolean' ? String(navigator.onLine) : null,
    ],
  ];
  return pairs
    .filter(
      (pair): pair is [string, string] =>
        typeof pair[1] === 'string' && pair[1] !== '',
    )
    .map(([label, value]) => `${label}: ${value}`);
}
