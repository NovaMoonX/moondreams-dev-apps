import type { EmailProvider, EmailSetupStepId } from '@apps/runway/types';

export type { EmailSetupStepId };

/** The walkthrough's steps for a provider, in order; the first is always the provider question. A provider that caught no confirmation (Other) has no confirm step until one arrives. */
export function getEmailSetupSteps(
  provider: EmailProvider | null,
  hasConfirmation: boolean,
): EmailSetupStepId[] {
  if (provider === 'gmail') {
    return ['provider', 'copy', 'forwarding', 'confirm', 'filter', 'test'];
  }
  if (provider === 'yahoo') {
    return ['provider', 'copy', 'forwarding', 'confirm', 'test'];
  }
  if (provider === 'other') {
    return [
      'provider',
      'copy',
      'rule',
      ...(hasConfirmation ? (['confirm'] as const) : []),
      'test',
    ];
  }
  if (provider === null) return ['provider'];
  return ['provider', 'copy', 'rule', 'test'];
}

/** The index of the step that limits the mail to the bank's alerts (a Gmail filter, another provider's rule); -1 when a provider has none. */
export const getFilterStepIndex = (steps: EmailSetupStepId[]) =>
  steps.findIndex((step) => step === 'filter' || step === 'rule');
