import type { SealedPayload } from '../../../appKeys/seal.js';
import { isPrivateInEffect, readPrivacyFacts } from '../privacy.js';
import { toPrivateMark } from './contextPeople.js';
import type { Effect, EffectRef } from './executeCommands.js';
import { mergeSoundsLike } from './heardNames.js';
import type { NoteSoundsLikeCommand } from './commands.js';
import { buildSoundsLikeLine } from './summaries.js';

const PRIVATE_PERSON_LABEL = 'a private person';

/** A task of the turn before, as the transaction read it. */
export interface EarlierTask {
  title: string;
  whoIds: string[];
  status: 'open' | 'done';
}

export interface SoundsLikePlan {
  whoRewrites: { id: string; data: Record<string, unknown> }[];
  taskUpdates: { id: string; data: Record<string, unknown> }[];
  effectRefs: EffectRef[];
  effects: Effect[];
  lines: string[];
  linkedWhoIds: string[];
  isPrivate: boolean;
}

const toTexts = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

/** Keeps each spelled correction that adds something new for someone who is still there: the heard form is written to that person's sealed `soundsLike`, and the turn before's tasks that name no one of this person gain the link. Each is an effect, so Undo restores both. */
export function planSoundsLike(input: {
  commands: NoteSoundsLikeCommand[];
  whos: Map<string, Record<string, unknown> | null>;
  earlierTasks: Map<string, EarlierTask>;
  now: number;
  isUnattended: boolean;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}): SoundsLikePlan {
  const empty: SoundsLikePlan = {
    whoRewrites: [],
    taskUpdates: [],
    effectRefs: [],
    effects: [],
    lines: [],
    linkedWhoIds: [],
    isPrivate: false,
  };
  return input.commands.reduce((plan, command) => {
    const opened = input.whos.get(command.whoId);
    if (!opened || typeof opened.name !== 'string') return plan;
    const next = mergeSoundsLike(
      Array.isArray(opened.soundsLike) ? toTexts(opened.soundsLike) : null,
      command.heardSpan,
      [opened.name, ...toTexts(opened.aliases)],
    );
    if (!next) return plan;
    const isPrivate = isPrivateInEffect(
      readPrivacyFacts({
        privateMark: toPrivateMark(opened.privateMark),
        isPrivacyCleared: opened.isPrivacyCleared === true,
      }),
    );
    const name =
      input.isUnattended && isPrivate ? PRIVATE_PERSON_LABEL : opened.name;
    const links = [...input.earlierTasks.entries()].flatMap(([id, task]) =>
      task.status === 'open' && !task.whoIds.includes(command.whoId)
        ? [{ id, task, whoIds: [...task.whoIds, command.whoId] }]
        : [],
    );
    const whoEffect: Effect = {
      written: { 'sealed.soundsLike': next },
      previous: { 'sealed.soundsLike': opened.soundsLike ?? null },
    };
    return {
      whoRewrites: [
        ...plan.whoRewrites,
        {
          id: command.whoId,
          data: {
            sealed: input.seal({ ...opened, soundsLike: next }),
            lastEditedAt: input.now,
          },
        },
      ],
      taskUpdates: [
        ...plan.taskUpdates,
        ...links.map(({ id, whoIds }) => ({
          id,
          data: { whoIds, lastEditedAt: input.now },
        })),
      ],
      effectRefs: [
        ...plan.effectRefs,
        { op: 'update', collection: 'who', docId: command.whoId },
        ...links.map(({ id }): EffectRef => ({
          op: 'update',
          collection: 'tasks',
          docId: id,
        })),
      ],
      effects: [
        ...plan.effects,
        whoEffect,
        ...links.map(({ task, whoIds }) => ({
          written: { 'sealed.title': task.title, whoIds },
          previous: { 'sealed.title': task.title, whoIds: task.whoIds },
        })),
      ],
      lines: [...plan.lines, buildSoundsLikeLine(command.heardSpan, name)],
      linkedWhoIds: [...plan.linkedWhoIds, command.whoId],
      isPrivate: plan.isPrivate || isPrivate,
    };
  }, empty);
}
