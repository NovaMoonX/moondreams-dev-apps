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

const MAX_APP_SOURCES = 100;

/** One ticked row of the review: a new record, or a merge into who the person has (the maybe answered yes). */
export interface BringInChoice {
  candidate: BringInCandidate;
  intoWhoId: string | null;
}

export interface BringInResult {
  kind: 'done' | 'offline' | 'failed';
  executionId: string | null;
  brought: number;
  merged: number;
}

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);

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

/** Brings the ticked records in one transaction that re-reads every who it merges into: a new one is made, a match keeps both records' facts (a name that differs becomes an alias, a phone and a line of notes are added, nothing is replaced), and each remembers the app records it came from. One Execution records them all, so Undo takes it back whole or in part. Needs a connection. */
export async function bringIntoCircle(
  uid: string,
  encryption: HelmEncryption,
  choices: BringInChoice[],
  appName: string,
): Promise<BringInResult> {
  if (!navigator.onLine)
    return { kind: 'offline', executionId: null, brought: 0, merged: 0 };
  const now = Date.now();
  const executionRef = doc(collection(userOf(uid), 'executions'));
  try {
    return await runHeldTransaction(uid, async (transaction) => {
      const reads = await Promise.all(
        choices.map(async (choice) => {
          if (choice.intoWhoId === null) return null;
          const snapshot = await transaction.get(
            doc(userOf(uid), 'who', choice.intoWhoId),
          );
          if (!snapshot.exists()) return null;
          const who = snapshot.data() as Who;
          const words = await openJson<WhoSealed>(
            who.sealed as Sealed,
            encryption,
          ).catch(() => null);
          return words ? { who, words } : null;
        }),
      );
      const writes = await Promise.all(
        choices.map(async (choice, index) => {
          const { candidate } = choice;
          const target = reads[index] ?? null;
          const sources = toSources(candidate, now);
          if (!target) {
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
              appSources: sources,
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
              ref: { op: 'create', collection: 'who', docId: id } as EffectRef,
              kind: 'create' as const,
              data,
              effect: {
                written: {
                  'sealed.name': candidate.name,
                  kind: candidate.source.circleKind,
                  tier: 'regular',
                },
                previous: null,
              } as ExecutionEffect,
            };
          }
          const { who, words } = target;
          const id = choice.intoWhoId ?? '';
          const known = [words.name, ...words.aliases].map((name) =>
            toComparable(name),
          );
          const aliases =
            known.includes(toComparable(candidate.name)) ||
            words.aliases.length >= MAX_ALIASES
              ? words.aliases
              : [...words.aliases, candidate.name];
          const phones = readContactPoints('phone', words);
          const key =
            candidate.phone === null
              ? null
              : toContactKey('phone', candidate.phone);
          const hasPhone =
            key === null ||
            phones.some((point) => toContactKey('phone', point.value) === key);
          const nextPhones =
            hasPhone || phones.length >= MAX_CONTACT_POINTS
              ? phones
              : [...phones, ...toPhone(candidate, phones.length === 0)];
          const notes = toNotes(words.notes, candidate.detail);
          const relation =
            words.relation ??
            (who.kind === 'person' ? toRelation(candidate) : null);
          const known_ = new Set(
            who.appSources.map((one) =>
              toSourceKey(one.connectorId, one.sourceRef),
            ),
          );
          const appSources = [
            ...who.appSources,
            ...sources.filter(
              (one) => !known_.has(toSourceKey(one.connectorId, one.sourceRef)),
            ),
          ].slice(-MAX_APP_SOURCES);
          const next: WhoSealed = {
            ...words,
            aliases,
            phones: nextPhones,
            phone: null,
            notes,
            relation,
          };
          const changed = {
            'sealed.aliases': [aliases, words.aliases],
            'sealed.phones': [nextPhones, phones],
            'sealed.notes': [notes, words.notes],
            'sealed.relation': [relation, words.relation],
          } as const;
          const entries = Object.entries(changed).filter(
            ([, [after, before]]) =>
              JSON.stringify(after) !== JSON.stringify(before),
          );
          return {
            ref: { op: 'update', collection: 'who', docId: id } as EffectRef,
            kind: 'update' as const,
            data: {
              sealed: await sealJson<WhoSealed>(next, encryption),
              appSources,
              lastEditedAt: now,
            },
            effect: {
              written: {
                'sealed.name': words.name,
                ...Object.fromEntries(
                  entries.map(([path, [after]]) => [path, after]),
                ),
                appSources,
              },
              previous: {
                'sealed.name': words.name,
                ...Object.fromEntries(
                  entries.map(([path, [, before]]) => [path, before]),
                ),
                appSources: who.appSources,
              },
            } as ExecutionEffect,
            id,
          };
        }),
      );
      writes.forEach((write) => {
        if (write.kind === 'create')
          transaction.set(doc(userOf(uid), 'who', write.ref.docId), write.data);
        else transaction.update(doc(userOf(uid), 'who', write.id), write.data);
      });
      const brought = writes.filter((write) => write.kind === 'create').length;
      const merged = writes.length - brought;
      const execution: Execution = {
        captureId: null,
        actor: 'person',
        via: null,
        category: 'import',
        autonomyLevel: 1,
        state: 'succeeded',
        effectRefs: writes.map((write) => write.ref),
        linkedWhoIds: writes.map((write) => write.ref.docId),
        linkedPlaceIds: [],
        undoesExecutionId: null,
        undoneByExecutionId: null,
        undoneDocIds: null,
        partUndoIds: null,
        questionRef: null,
        errorCode: null,
        privacy: 'ordinary',
        createdAt: now,
        decidedAt: now,
        finishedAt: now,
        sealed: await sealJson<ExecutionSealed>(
          {
            summary: `${HELM_COPY.bringInSummary(brought, merged)} from ${appName}`,
            said: null,
            commands: [],
            effects: writes.map((write) => write.effect),
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
      };
    });
  } catch {
    return { kind: 'failed', executionId: null, brought: 0, merged: 0 };
  }
}
