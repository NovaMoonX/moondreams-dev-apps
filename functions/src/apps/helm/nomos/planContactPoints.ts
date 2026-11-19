import type { SealedPayload } from '../../../appKeys/seal.js';
import { isPrivateInEffect, readPrivacyFacts } from '../privacy.js';
import type { AddContactPointCommand } from './commands.js';
import {
  addContactPoint,
  readContactPoints,
  toPhoneKey,
} from './contactPoints.js';
import { toPrivateMark } from './contextPeople.js';
import type { Effect, EffectRef } from './executeCommands.js';
import { buildContactLine } from './summaries.js';

const PRIVATE_PERSON_LABEL = 'a private person';

export interface ContactPlan {
  whoRewrites: { id: string; data: Record<string, unknown> }[];
  effectRefs: EffectRef[];
  effects: Effect[];
  lines: string[];
  notKept: string[];
  linkedWhoIds: string[];
  isPrivate: boolean;
}

/** Plans each number or address the person said for someone they have as one undoable rewrite of that person's sealed lists: the first of its kind is primary, a repeat or an 11th is not kept, and the old single phone or email is written null. A person another part of the turn already rewrites is left for the next message. */
export function planContactPoints(input: {
  commands: AddContactPointCommand[];
  whos: Map<string, Record<string, unknown> | null>;
  skipWhoIds: Set<string>;
  newId: () => string;
  now: number;
  isUnattended: boolean;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}): ContactPlan {
  const plan: ContactPlan = {
    whoRewrites: [],
    effectRefs: [],
    effects: [],
    lines: [],
    notKept: [],
    linkedWhoIds: [],
    isPrivate: false,
  };
  const whoIds = [...new Set(input.commands.map((command) => command.whoId))];
  return whoIds.reduce((state, whoId) => {
    const opened = input.whos.get(whoId);
    if (!opened || typeof opened.name !== 'string') return state;
    const isPrivate = isPrivateInEffect(
      readPrivacyFacts({
        privateMark: toPrivateMark(opened.privateMark),
        isPrivacyCleared: opened.isPrivacyCleared === true,
      }),
    );
    const shown =
      input.isUnattended && isPrivate ? PRIVATE_PERSON_LABEL : opened.name;
    const commands = input.commands.filter(
      (command) => command.whoId === whoId,
    );
    if (input.skipWhoIds.has(whoId))
      return {
        ...state,
        notKept: [
          ...state.notKept,
          `Couldn’t add ${shown}’s details this time`,
        ],
      };
    const settled = commands.reduce(
      (acc, command) => {
        if (
          command.contactKind === 'phone' &&
          toPhoneKey(command.value) === null
        )
          return {
            ...acc,
            notKept: [
              ...acc.notKept,
              `That number for ${shown} looked too short`,
            ],
          };
        const added = addContactPoint(
          command.contactKind,
          acc[command.contactKind],
          {
            id: input.newId(),
            value: command.value,
            label: command.label ?? '',
          },
        );
        if (typeof added === 'string')
          return {
            ...acc,
            notKept: [
              ...acc.notKept,
              added === 'duplicate'
                ? `${shown} already has that ${command.contactKind === 'phone' ? 'number' : 'address'}`
                : `${shown} has as many as fit`,
            ],
          };
        const point = added.points[added.points.length - 1];
        return {
          ...acc,
          [command.contactKind]: added.points,
          touched: new Set([...acc.touched, command.contactKind]),
          lines: [
            ...acc.lines,
            buildContactLine({
              name: shown,
              kind: command.contactKind,
              label: point?.label ?? null,
            }),
          ],
        };
      },
      {
        phone: readContactPoints('phone', opened),
        email: readContactPoints('email', opened),
        touched: new Set<'phone' | 'email'>(),
        lines: [] as string[],
        notKept: [] as string[],
      },
    );
    if (settled.touched.size === 0)
      return { ...state, notKept: [...state.notKept, ...settled.notKept] };
    const words = {
      ...(settled.touched.has('phone') && {
        phones: settled.phone,
        phone: null,
      }),
      ...(settled.touched.has('email') && {
        emails: settled.email,
        email: null,
      }),
    };
    const label = { 'sealed.name': opened.name };
    return {
      whoRewrites: [
        ...state.whoRewrites,
        {
          id: whoId,
          data: {
            sealed: input.seal({ ...opened, ...words }),
            lastEditedAt: input.now,
          },
        },
      ],
      effectRefs: [
        ...state.effectRefs,
        { op: 'update', collection: 'who', docId: whoId },
      ],
      effects: [
        ...state.effects,
        {
          written: {
            ...label,
            ...Object.fromEntries(
              Object.entries(words).map(([field, value]) => [
                `sealed.${field}`,
                value,
              ]),
            ),
          },
          previous: {
            ...label,
            ...Object.fromEntries(
              Object.keys(words).map((field) => [
                `sealed.${field}`,
                opened[field] ?? null,
              ]),
            ),
          },
        },
      ],
      lines: [...state.lines, ...settled.lines],
      notKept: [...state.notKept, ...settled.notKept],
      linkedWhoIds: [...state.linkedWhoIds, whoId],
      isPrivate: state.isPrivate || isPrivate,
    };
  }, plan);
}
