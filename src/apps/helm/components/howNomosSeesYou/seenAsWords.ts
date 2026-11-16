import type { SeenAsKind } from '@apps/helm/engine/seenAs';
import { formatDateShort } from '@/utils/formatUtils';

export const SEEN_AS_WORDS = {
  groups: {
    whatWorks: 'What works for you',
    whatDoesnt: 'What gets in the way',
    rhythm: 'Your rhythm',
    howYouTalk: 'How you talk',
    tendency: 'Tendencies',
  } satisfies Record<SeenAsKind, string>,
  groupTitle: (label: string, count: number) => `${label} · ${count}`,
  emptyOn: (assistant: string) =>
    `Lines show up here as ${assistant} learns what works for you.`,
  emptyOff: (assistant: string) =>
    `Learning is off, so ${assistant} isn't working out anything new about you.`,
  ringNoticed: (assistant: string) => `${assistant} noticed`,
  ringSaid: 'You said',
  noticedOn: (assistant: string, date: string) =>
    `${assistant} noticed · ${date}`,
  saidOn: (date: string) => `You said · ${date}`,
  rowSaid: (date: string, assistant: string) =>
    `You said · ${date} · was ${assistant}'s guess`,
  fromTitle: 'Where this came from',
  fromNothing: 'The words behind this line are no longer kept.',
  aCheckIn: 'a check-in',
  saidTo: (assistant: string) => `said to ${assistant}`,
  someThingYouSaid: 'Something you said',
  correct: "That's not quite right",
  correctSubtitle: (assistant: string) =>
    `Say or type how it is. ${assistant} uses yours from now on.`,
  correctField: 'How it is',
  correctPlaceholder: 'Say or type how it is',
  remove: 'Remove this',
  removeSubtitle: (assistant: string) =>
    `${assistant} forgets the line and won't draw it from these words again. Your words stay where you said them.`,
  changed: 'Changed it.',
  removed: (assistant: string) =>
    `Removed it. ${assistant} won't work it out from those words again.`,
  undone: 'Put it back.',
  failed: "That didn't save. Try again.",
} as const;

/** "Tue, Nov 3, 9:40 PM": a said instant in the device's time. */
export const toSaidAt = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export const toNoticedDay = (at: number) => formatDateShort(at);
