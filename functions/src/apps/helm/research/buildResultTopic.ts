import type { SealedPayload } from '../../../appKeys/seal.js';
import type {
  ResearchOverviewRead,
  ResearchSourceRead,
} from '../nomos/readResearchOverview.js';

interface Section {
  id: string;
  heading: string | null;
  level: 2;
  markdown: string;
  writtenBy: 'nomos';
  sources: never[];
}

const toCell = (text: string) =>
  text.replace(/\|/g, '\\|').replace(/\s+/g, ' ');

const toTable = (comparison: { columns: string[]; rows: string[][] }) =>
  [
    `| ${comparison.columns.map(toCell).join(' | ')} |`,
    `| ${comparison.columns.map(() => '---').join(' | ')} |`,
    ...comparison.rows.map(
      (row) =>
        `| ${comparison.columns.map((_, index) => toCell(row[index] ?? '')).join(' | ')} |`,
    ),
  ].join('\n');

const toLink = (source: ResearchSourceRead) =>
  `[${source.title.replace(/[[\]]/g, '')}](${source.url}) · ${source.site}`;

/** The topic a finished look ahead of a project is filed as: the overview's sections, a comparison as a table and a closing list of sources. A top-level topic at its first version, under the project. */
export function buildResultTopic(input: {
  subject: string;
  overview: ResearchOverviewRead;
  sources: ResearchSourceRead[];
  projectId: string;
  captureId: string | null;
  newId: () => string;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}) {
  const section = (heading: string, markdown: string): Section => ({
    id: input.newId(),
    heading,
    level: 2,
    markdown,
    writtenBy: 'nomos',
    sources: [],
  });
  const { overview } = input;
  const sections = [
    ...overview.sections.map((entry) =>
      section(
        entry.heading,
        entry.points.map((point) => `- ${point}`).join('\n'),
      ),
    ),
    ...(overview.comparison
      ? [section('Comparison', toTable(overview.comparison))]
      : []),
    ...(input.sources.length > 0
      ? [
          section(
            'Sources',
            input.sources.map((source) => `- ${toLink(source)}`).join('\n'),
          ),
        ]
      : []),
  ];
  const name = `${input.subject.charAt(0).toUpperCase()}${input.subject.slice(1)}`;
  return {
    topic: {
      parentId: null,
      depth: 1,
      projectIds: [input.projectId],
      version: 1,
      docState: 'current',
      pendingNoteIds: [],
      writeClaim: null,
      overviewOf: {},
      createdBy: 'nomos',
      executionId: null,
      createdAt: input.now,
      lastEditedAt: input.now,
      lastWrittenAt: input.now,
      privacy: null,
      sealed: input.seal({
        name,
        emoji: null,
        overview: overview.summary,
        sections,
        privateMark: null,
        isPrivacyCleared: null,
      }),
    },
    version: {
      version: 1,
      restoredFromVersion: null,
      createdBy: 'nomos',
      reason: 'firstWritten',
      noteIds: [],
      sourceCaptureId: input.captureId,
      executionId: null,
      createdAt: input.now,
      sealed: input.seal({
        sections,
        changeSummary: 'Looked into ahead of the date',
        requestQuote: null,
        parentName: null,
      }),
    },
  };
}
