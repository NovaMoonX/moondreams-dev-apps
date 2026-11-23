import type {
  EmailProvider,
  EmailSetupStepId,
} from '@/lib/emailForwarding/types';

/** Every step in the order a person meets it; a stored step id that is hidden now resolves to the nearest shown one before it. */
const FULL_ORDER: EmailSetupStepId[] = [
  'provider',
  'copy',
  'forwarding',
  'rule',
  'confirm',
  'filter',
  'test',
];

interface StepOptions {
  /** Gmail's separate filter step, for mail that should be narrowed to one sender; default true. */
  hasFilterStep?: boolean;
}

/** The walkthrough's steps for a provider, in order; the first is always the provider question. A provider that caught no confirmation (Other) has no confirm step until one arrives. */
export function getEmailSetupSteps(
  provider: EmailProvider | null,
  hasConfirmation: boolean,
  { hasFilterStep = true }: StepOptions = {},
): EmailSetupStepId[] {
  if (provider === 'gmail') {
    return [
      'provider',
      'copy',
      'forwarding',
      'confirm',
      ...(hasFilterStep ? (['filter'] as const) : []),
      'test',
    ];
  }
  if (provider === 'yahoo') {
    return ['provider', 'copy', 'forwarding', 'confirm', 'test'];
  }
  if (provider === 'proton') {
    return ['provider', 'copy', 'rule', 'confirm', 'test'];
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

/** The index of the step that limits the mail to one sender (a Gmail filter, another provider's rule); -1 when a provider has none. */
export const getFilterStepIndex = (steps: EmailSetupStepId[]) =>
  steps.findIndex((step) => step === 'filter' || step === 'rule');

/** Where a stored step id lands in the steps shown now: its own place, else the shown step before it in the full order, else the start. */
export function resolveStepIndex(
  steps: EmailSetupStepId[],
  stepId: EmailSetupStepId | null,
) {
  if (stepId === null) return 0;
  const fullIndex = FULL_ORDER.indexOf(stepId);
  const shown = FULL_ORDER.slice(0, fullIndex + 1)
    .reverse()
    .map((id) => steps.indexOf(id))
    .find((index) => index >= 0);
  return shown ?? 0;
}
