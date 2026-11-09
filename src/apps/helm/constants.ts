export const DEFAULT_ASSISTANT_NAME = 'Nomos';

export const DEFAULT_DAY_START_TIME = '08:00';
export const DEFAULT_DAY_END_TIME = '22:00';
export const DEFAULT_PLAN_FILL_PERCENT = 50;

/** Every line that names the assistant is a template filled with `useAssistantName()`, so a renamed assistant is renamed everywhere. */
export const HELM_COPY = {
  homeHint: 'Tap to talk, or type',
  firstOpen: (name: string) =>
    `Tap Talk and tell ${name} the first thing on your mind. A task, a date, a name: ${name} sorts it.`,
  composerPlaceholder: (name: string) => `Type to ${name}`,
  composerLabel: (name: string) => `Message to ${name}`,
  todayFirstRun:
    'Nothing is planned for today yet. Once you have told Helm about a task or an event, it appears here.',
} as const;
