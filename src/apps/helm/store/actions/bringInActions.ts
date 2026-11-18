import { collection, doc } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { generateUuid } from '@/utils';
import { toComparable } from '@/utils/optionMatchUtils';
import { HELM_COPY, MAX_ALIASES } from '@apps/helm/constants';
import {
  MAX_CONTACT_POINTS,
  readContactPoints,
  toContactKey,
} from '@apps/helm/engine/contactPoints';
import { toSourceKey, type BringInCandidate } from '@apps/helm/engine/bringIn';
import { openJson, sealJson } from '@apps/helm/security';
import { runHeldTransaction } from '@apps/helm/store/actions/heldTransaction';
import type {
  AppSource,
  EffectRef,
  Execution,
  ExecutionEffect,
  ExecutionSealed,
  HelmEncryption,
  Sealed,
  Who,
  WhoSealed,
} from '@apps/helm/types';
import { isPrivateRead } from '@apps/helm/utils/privacy';

const MAX_APP_SOURCES = 100;

/** One ticked row of the review: a new record, or a merge into who the person has (the maybe answered yes). */
export interface BringInChoice {
  candidate: BringInCandidate;
  intoWhoId: string | null;
}

export interface BringInResult {
  kind: 'done' | 'offline' | 'failed' | 'nothing';
  executionId: string | null;
  brought: number;
  merged: number;
  /** Choices left out because the who they merge into was removed or no longer opens. */
  skipped: number;
}

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);

const none = (kind: BringInResult['kind'], skipped = 0): BringInResult => ({
  kind,
  executionId: null,
  brought: 0,
  merged: 0,
  skipped,
});

const toSources = (candidate: BringInCandidate, now: number): AppSource[] =>
  candidate.sourceRefs.map((sourceRef) => ({
    connectorId: candidate.connectorId,
    sourceRef,
    importedAt: now,
  }));

const emptyWords = (): WhoSealed => ({
  name: '',
  aliases: [],
  kin: null,
  soundsLike: null,
  refusedAliases: null,
  relation: null,
  phones: [],
  emails: [],
  phone: null,
  email: null,
  notes: null,
  species: null,
  organizationKind: null,
  privateMark: null,
  isPrivacyCleared: false,
  home: null,
  homeSource: null,
  away: null,
  nearNow: null,
});

const toRelation = (candidate: BringInCandidate) =>
  candidate.source.relation ?? candidate.role?.toLowerCase() ?? null;

const toPhone = (candidate: BringInCandidate, isFirst: boolean) =>
  candidate.phone === null
    ? []
    : [
        {
          id: generateUuid(),
          value: candidate.phone,
          label: 'Work',
          isPrimary: isFirst,
        },
      ];

/** A line joined under what the person already wrote, never replacing it. */
const toNotes = (notes: string | null, line: string | null) =>
  line === null || (notes ?? '').toLowerCase().includes(line.toLowerCase())
    ? notes
    : notes === null || notes.trim() === ''
      ? line
      : `${notes}\n${line}`;

interface Target {
  who: Who;
  words: WhoSealed;
}

/** Everything the candidates merging into one who add, folded over the same words so no one's addition is lost: a name that differs becomes an alias, a phone and a line of notes are added, nothing is replaced. */
const foldMerge = (
  target: Target,
  candidates: BringInCandidate[],
  now: number,
) => {
  const { who, words } = target;
  const start = {
    aliases: words.aliases,
    phones: readContactPoints('phone', words),
    notes: words.notes,
    relation: words.relation,
    appSources: who.appSources,
  };
  const folded = candidates.reduce((state, candidate) => {
    const known = [words.name, ...state.aliases].map((name) =>
      toComparable(name),
    );
    const key =
      candidate.phone === null ? null : toContactKey('phone', candidate.phone);
    const hasPhone =
      key === null ||
      state.phones.some((point) => toContactKey('phone', point.value) === key);
    const seen = new Set(
      state.appSources.map((one) =>
        toSourceKey(one.connectorId, one.sourceRef),
      ),
    );
    return {
      aliases:
        known.includes(toComparable(candidate.name)) ||
        state.aliases.length >= MAX_ALIASES
          ? state.aliases
          : [...state.aliases, candidate.name],
      phones:
        hasPhone || state.phones.length >= MAX_CONTACT_POINTS
          ? state.phones
          : [...state.phones, ...toPhone(candidate, state.phones.length === 0)],
      notes: toNotes(state.notes, candidate.detail),
      relation:
        state.relation ??
        (who.kind === 'person' ? toRelation(candidate) : null),
      appSources: [
        ...state.appSources,
        ...toSources(candidate, now).filter(
          (one) => !seen.has(toSourceKey(one.connectorId, one.sourceRef)),
        ),
      ].slice(-MAX_APP_SOURCES),
    };
  }, start);
  const changed: [string, unknown, unknown][] = [
    ['sealed.aliases', folded.aliases, start.aliases],
    ['sealed.phones', folded.phones, start.phones],
    ['sealed.notes', folded.notes, start.notes],
    ['sealed.relation', folded.relation, start.relation],
  ];
  return {
    folded,
    changed: changed.filter(
      ([, after, before]) => JSON.stringify(after) !== JSON.stringify(before),
    ),
  };
};

/** Brings the ticked records in one transaction that re-reads every who it merges into: a new one is made, matches into one who are folded into a single update that keeps both records' facts, and each remembers the app records it came from. A choice whose who is gone or won't open is skipped, never made again as a duplicate. One Execution records them all, so Undo takes it back whole or in part, and it is private when any who merged into is. Needs a connection. */
export async function bringIntoCircle(
  uid: string,
  encryption: HelmEncryption,
  choices: BringInChoice[],
  appName: string,
): Promise<BringInResult> {
  if (!navigator.onLine) return none('offline');
  const now = Date.now();
  const executionRef = doc(collection(userOf(uid), 'executions'));
  const mergeIds = Array.from(
    new Set(choices.flatMap((choice) => choice.intoWhoId ?? [])),
  );
  try {
    return await runHeldTransaction(uid, async (transaction) => {
      const targets = new Map(
        await Promise.all(
          mergeIds.map(async (id): Promise<[string, Target | null]> => {
            const snapshot = await transaction.get(doc(userOf(uid), 'who', id));
            if (!snapshot.exists()) return [id, null];
            const who = snapshot.data() as Who;
            const words = await openJson<WhoSealed>(
              who.sealed as Sealed,
              encryption,
            ).catch(() => null);
            return [id, words ? { who, words } : null];
          }),
        ),
      );
      const creates = await Promise.all(
        choices
          .filter((choice) => choice.intoWhoId === null)
          .map(async ({ candidate }) => {
            const id = doc(collection(userOf(uid), 'who')).id;
            const words: WhoSealed = {
              ...emptyWords(),
              name: candidate.name,
              relation:
                candidate.source.circleKind === 'person'
                  ? toRelation(candidate)
                  : null,
              species: candidate.source.species,
              organizationKind: candidate.source.organizationKind,
              notes: candidate.detail,
              phones: toPhone(candidate, true),
            };
            const data: Who = {
              kind: candidate.source.circleKind,
              tier: 'regular',
              tierSetBy: 'nomos',
              isSelf: false,
              placeIds: [],
              photoMediaId: null,
              mediaIds: [],
              importedFrom: null,
              importedFields: {},
              appSources: toSources(candidate, now),
              lastMentionedAt: null,
              yearlyDateCount: 0,
              momentCount: 0,
              createdBy: 'person',
              executionId: executionRef.id,
              privacy: 'ordinary',
              createdAt: now,
              lastEditedAt: null,
              sealed: await sealJson<WhoSealed>(words, encryption),
            };
            return {
              id,
              data,
              ref: { op: 'create', collection: 'who', docId: id } as EffectRef,
              effect: {
                written: {
                  'sealed.name': candidate.name,
                  kind: candidate.source.circleKind,
                  tier: 'regular',
                },
                previous: null,
              } as ExecutionEffect,
            };
          }),
      );
      const groups = mergeIds.flatMap((id) => {
        const target = targets.get(id) ?? null;
        return target
          ? [
              {
                id,
                target,
                group: choices
                  .filter((choice) => choice.intoWhoId === id)
                  .map((choice) => choice.candidate),
              },
            ]
          : [];
      });
      const merges = await Promise.all(
        groups.map(async ({ id, target, group }) => {
          const { folded, changed } = foldMerge(target, group, now);
          const next: WhoSealed = {
            ...target.words,
            aliases: folded.aliases,
            phones: folded.phones,
            phone: null,
            notes: folded.notes,
            relation: folded.relation,
          };
          return {
            id,
            count: group.length,
            isPrivate: isPrivateRead(target.who),
            ref: {
              op: 'update',
              collection: 'who',
              docId: id,
            } as EffectRef,
            data: {
              sealed: await sealJson<WhoSealed>(next, encryption),
              appSources: folded.appSources,
              lastEditedAt: now,
            },
            effect: {
              written: {
                'sealed.name': target.words.name,
                ...Object.fromEntries(
                  changed.map(([path, after]) => [path, after]),
                ),
                appSources: folded.appSources,
              },
              previous: {
                'sealed.name': target.words.name,
                ...Object.fromEntries(
                  changed.map(([path, , before]) => [path, before]),
                ),
                appSources: target.who.appSources,
              },
            } as ExecutionEffect,
          };
        }),
      );
      const skipped = choices.filter(
        (choice) =>
          choice.intoWhoId !== null &&
          !merges.some((merge) => merge.id === choice.intoWhoId),
      ).length;
      if (creates.length + merges.length === 0) return none('nothing', skipped);
      creates.forEach((write) =>
        transaction.set(doc(userOf(uid), 'who', write.id), write.data),
      );
      merges.forEach((write) =>
        transaction.update(doc(userOf(uid), 'who', write.id), write.data),
      );
      const written = [...creates, ...merges];
      const brought = creates.length;
      const merged = merges.reduce((sum, merge) => sum + merge.count, 0);
      const execution: Execution = {
        captureId: null,
        actor: 'person',
        via: null,
        category: 'import',
        autonomyLevel: 1,
        state: 'succeeded',
        effectRefs: written.map((write) => write.ref),
        linkedWhoIds: written.map((write) => write.ref.docId),
        linkedPlaceIds: [],
        undoesExecutionId: null,
        undoneByExecutionId: null,
        undoneDocIds: null,
        partUndoIds: null,
        questionRef: null,
        errorCode: null,
        privacy: merges.some((merge) => merge.isPrivate)
          ? 'private'
          : 'ordinary',
        createdAt: now,
        decidedAt: now,
        finishedAt: now,
        sealed: await sealJson<ExecutionSealed>(
          {
            summary: `${HELM_COPY.bringInSummary(brought, merged)} from ${appName}`,
            said: null,
            commands: [],
            effects: written.map((write) => write.effect),
            undoReport: null,
            spoken: null,
            heldSpoken: null,
            goneIds: null,
            undoReason: null,
            lines: null,
            abilityOffer: null,
            awayZoneOffer: null,
          },
          encryption,
        ),
      };
      transaction.set(executionRef, execution);
      return {
        kind: 'done' as const,
        executionId: executionRef.id,
        brought,
        merged,
        skipped,
      };
    });
  } catch {
    return none('failed');
  }
}
