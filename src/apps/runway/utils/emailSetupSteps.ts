import type { EmailProvider, EmailSetupStepId } from '@apps/runway/types';

export type { EmailSetupStepId };

/** The walkthrough's steps for a provider, in order; Other has no confirm step until a confirmation arrives. */
export function getEmailSetupSteps(
  provider: EmailProvider | null,
  hasConfirmation: boolean,
): EmailSetupStepId[] {
  if (provider === 'gmail') {
    return [
      'provider',
      'copy',
      'bank',
      'forwarding',
      'confirm',
      'filter',
      'test',
    ];
  }
  if (provider === 'yahoo') {
    return ['provider', 'copy', 'forwarding', 'confirm', 'test'];
  }
  if (provider === 'proton') {
    return ['provider', 'copy', 'bank', 'rule', 'confirm', 'test'];
  }
  if (provider === 'other') {
    return [
      'provider',
      'copy',
      'bank',
      'rule',
      ...(hasConfirmation ? (['confirm'] as const) : []),
      'test',
    ];
  }
  if (provider === null) return ['provider'];
  return ['provider', 'copy', 'bank', 'rule', 'test'];
}

/** The steps for adding one more bank to a finished setup: the bank, its filter or rule, then one alert to try it; Yahoo forwards everything, so it has none. */
export function getAddBankSteps(
  provider: EmailProvider | null,
): EmailSetupStepId[] {
  if (provider === 'yahoo' || provider === null) return [];
  return ['bank', provider === 'gmail' ? 'filter' : 'rule', 'test'];
}

/** The index of the first step that limits the mail to the bank's alerts (naming the bank, then its Gmail filter or another provider's rule); -1 when a provider has none. */
export const getFilterStepIndex = (steps: EmailSetupStepId[]) =>
  steps.findIndex(
    (step) => step === 'bank' || step === 'filter' || step === 'rule',
  );
