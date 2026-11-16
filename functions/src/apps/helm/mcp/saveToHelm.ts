import type { SealedPayload } from '../../../appKeys/seal.js';
import {
  NOTE_BODY_CAP,
  NOTE_TITLE_CAP,
  NOTES_LIMIT,
} from '../nomos/commands.js';
import {
  toBehindState,
  type Effect,
  type EffectRef,
  type NoteTopicState,
  type ResultNote,
} from '../nomos/executeCommands.js';
import { NOTES_FULL_LINE } from '../nomos/summaries.js';
import { fitsTopic, readableSections } from '../media/markdownSections.js';
import { TOPICS_LIMIT } from '../topicLimits.js';

export const SAVE_TITLE_CAP = 120;
export const SAVE_ABOUT_CAP = 200;
export const SAVE_LEARNED_CAP = NOTE_BODY_CAP;
export const SAVE_NEW_TOPIC_CAP = 40;
export const SAVE_SOURCES_KEPT = 5;

export interface SavedLink {
  title: string;
  url: string;
}

/** The few links worth keeping: https only, at most five, each with a name. */
export const cleanSavedLinks = (
  sources: readonly { title: string; url: string }[],
): SavedLink[] =>
  sources
    .flatMap(({ title, url }) => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:'
          ? [{ title: title.trim() || parsed.hostname, url: parsed.href }]
          : [];
      } catch {
        return [];
      }
    })
    .filter(
      (link, index, all) =>
        all.findIndex((other) => other.url === link.url) === index,
    )
    .slice(0, SAVE_SOURCES_KEPT);

export type SavePlan =
  | { kind: 'full'; line: string }
  | {
      kind: 'saved';
      where: 'topic' | 'newTopic' | 'loose';
      topicName: string | null;
      noteTitle: string;
      linkCount: number;
      noteId: string;
      noteData: Record<string, unknown>;
      topic: {
        id: string;
        data: Record<string, unknown>;
        version: Record<string, unknown>;
      } | null;
      filing: { id: string; docState: string; addPendingId: string } | null;
      effectRefs: EffectRef[];
      effects: Effect[];
      lines: ResultNote[];
      summary: string;
      notice: string | null;
    };

export const TOPICS_FULL_NOTICE = `The topics are full (${TOPICS_LIMIT}), so it was saved as a note on its own.`;
export const TOO_LONG_NOTICE =
  'It has too many parts to become a topic, so it was saved as a note on its own.';

/** What saving an outside assistant's learning writes: one note, filed under a topic the person has, a new topic made from it, or left loose. Pure; the caller writes it in one transaction. */
export function planSaveToHelm(input: {
  title: string;
  learned: string;
  about: string | null;
  sources: readonly { title: string; url: string }[];
  topic: { id: string; state: NoteTopicState } | null;
  newTopic: string | null;
  noteCount: number;
  topicCount: number;
  via: string;
  captureId: string;
  executionId: string;
  now: number;
  newId: () => string;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}): SavePlan {
  const { now, seal, captureId, executionId, via } = input;
  if (input.noteCount >= NOTES_LIMIT) {
    return { kind: 'full', line: NOTES_FULL_LINE };
  }
  const noteTitle = input.title.trim().slice(0, NOTE_TITLE_CAP).trimEnd();
  const links = cleanSavedLinks(input.sources);
  const noteId = input.newId();
  const newTopicName = input.topic
    ? ''
    : (input.newTopic ?? '').trim().slice(0, SAVE_NEW_TOPIC_CAP).trimEnd();
  const sections = readableSections(input.learned);
  const isTopicWanted = newTopicName !== '';
  const hasRoom = input.topicCount < TOPICS_LIMIT;
  const canBeTopic = isTopicWanted && hasRoom && fitsTopic(sections);
  const notice = !isTopicWanted
    ? null
    : !hasRoom
      ? TOPICS_FULL_NOTICE
      : canBeTopic
        ? null
        : TOO_LONG_NOTICE;
  const topicId = canBeTopic ? input.newId() : null;
  const source = {
    kind: 'message' as const,
    captureId,
    at: now,
    noteId,
  };
  const hasHeadings = sections.some((section) => section.heading !== null);
  const topicSections = sections.map((section) => ({
    id: input.newId(),
    heading:
      !hasHeadings && sections.length === 1 ? noteTitle : section.heading,
    level: !hasHeadings && sections.length === 1 ? (2 as const) : section.level,
    markdown: section.markdown,
    writtenBy: 'nomos' as const,
    sources: [source],
  }));
  const existing = input.topic;
  const summary = topicId
    ? `Started a topic, ${newTopicName}, from ${via}`
    : existing
      ? `Saved ${noteTitle} to ${existing.state.name}`
      : `Saved ${noteTitle} as a note`;
  const noteData = {
    topicIds: topicId ? [topicId] : existing ? [existing.id] : [],
    source: 'outside',
    isFromGeneralAnswer: false,
    checkedAt: null,
    hasHealthCaution: false,
    sourceCaptureId: captureId,
    sourceMediaId: null,
    projectIds: [],
    createdBy: 'nomos',
    executionId,
    createdAt: now,
    lastEditedAt: null,
    sealed: seal({
      title: noteTitle,
      body: input.about
        ? `About: ${input.about.trim()}\n\n${input.learned}`
        : input.learned,
      via,
      links,
    }),
  };
  const topic = topicId
    ? {
        id: topicId,
        data: {
          parentId: null,
          depth: 1,
          projectIds: [],
          version: 1,
          docState: 'current',
          pendingNoteIds: [],
          writeClaim: null,
          overviewOf: {},
          createdBy: 'nomos',
          executionId,
          createdAt: now,
          lastEditedAt: null,
          lastWrittenAt: now,
          sealed: seal({
            name: newTopicName,
            emoji: null,
            overview: null,
            sections: topicSections,
          }),
        },
        version: {
          version: 1,
          restoredFromVersion: null,
          createdBy: 'nomos',
          reason: 'imported',
          noteIds: [noteId],
          sourceCaptureId: captureId,
          executionId,
          createdAt: now,
          sealed: seal({
            sections: topicSections,
            changeSummary: `Started from ${via}`,
            requestQuote: null,
            parentName: null,
          }),
        },
      }
    : null;
  const filing =
    !topicId && existing
      ? {
          id: existing.id,
          docState: toBehindState(existing.state.docState),
          addPendingId: noteId,
        }
      : null;
  const refs: { ref: EffectRef; effect: Effect }[] = [
    {
      ref: { op: 'create', collection: 'notes', docId: noteId },
      effect: { written: { 'sealed.title': summary }, previous: null },
    },
    ...(topicId
      ? [
          {
            ref: {
              op: 'create',
              collection: 'topics',
              docId: topicId,
            } as const,
            effect: {
              written: {
                'sealed.title': summary,
                'sealed.name': newTopicName,
                importedVersion: 1,
              },
              previous: null,
            },
          },
        ]
      : []),
    ...(filing && existing
      ? [
          {
            ref: {
              op: 'update',
              collection: 'topics',
              docId: filing.id,
            } as const,
            effect: {
              written: {
                docState: filing.docState,
                pendingNoteIds: [
                  ...existing.state.pendingNoteIds,
                  filing.addPendingId,
                ],
              },
              previous: {
                docState: existing.state.docState,
                pendingNoteIds: existing.state.pendingNoteIds,
              },
            },
          },
        ]
      : []),
  ];
  return {
    kind: 'saved',
    where: topicId ? 'newTopic' : existing ? 'topic' : 'loose',
    topicName: topicId ? newTopicName : (existing?.state.name ?? null),
    noteTitle,
    linkCount: links.length,
    noteId,
    noteData,
    topic,
    filing,
    effectRefs: refs.map(({ ref }) => ref),
    effects: refs.map(({ effect }) => effect),
    lines: [
      topicId
        ? { text: summary, ref: { collection: 'topics', id: topicId } }
        : { text: summary, ref: { collection: 'notes', id: noteId } },
    ],
    summary,
    notice,
  };
}

/** What the assistant is told once it is saved, in words the person's assistant would use. */
export const describeSave = (
  plan: Extract<SavePlan, { kind: 'saved' }>,
  name: string,
) =>
  [
    plan.where === 'newTopic'
      ? `Saved "${plan.noteTitle}" to Helm and started a new topic, ${plan.topicName}, with it.`
      : plan.where === 'topic'
        ? `Saved "${plan.noteTitle}" to Helm under the topic ${plan.topicName}. It is listed in that topic now, and ${name} works it into the topic's text the next time the topic is opened.`
        : `Saved "${plan.noteTitle}" to Helm as a note on its own.`,
    ...(plan.notice ? [plan.notice] : []),
    ...(plan.linkCount > 0
      ? [
          `Kept ${plan.linkCount === 1 ? '1 link' : `${plan.linkCount} links`} with it.`,
        ]
      : []),
    `The person can see it, and undo it, in Helm under From your assistants.`,
  ].join(' ');
