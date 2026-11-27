import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

import { APP_REGISTRY } from '../../src/lib/app/app.registry.ts';
import { FEATURE_GATES } from '../../src/lib/gates/gates.registry.ts';
import {
  WHATS_NEW_REPLACES_MAX,
  WHATS_NEW_TEXT_MAX,
  type WhatsNewDraft,
  type WhatsNewFile,
} from '../../src/lib/whatsNew/whatsNewTypes.ts';

export const WHATS_NEW_DIR = 'whats-new';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KINDS = ['new', 'improved', 'fixed'];
const AUDIENCES = ['everyone', 'debug'];
const KEYS = [
  'app',
  'kind',
  'text',
  'path',
  'gate',
  'audience',
  'isTold',
  'emoji',
  'replaces',
];

const graphemeCount = (value: string) =>
  [...new Intl.Segmenter().segment(value)].length;

const isEmojiMark = (value: string) =>
  graphemeCount(value) <= 2 &&
  /\p{Extended_Pictographic}/u.test(value) &&
  !/[\p{L}\p{N}]/u.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const checkNote = (note: unknown, at: string): string[] => {
  if (!isRecord(note)) return [`${at}: must be an object`];
  const missing = KEYS.filter((key) => !(key in note));
  if (missing.length > 0) {
    return [
      `${at}: missing ${missing.join(', ')} (write null for an empty path, gate or emoji, and [] for no replaces)`,
    ];
  }
  const extra = Object.keys(note).filter((key) => !KEYS.includes(key));
  const { app, kind, text, path, gate, audience, isTold, emoji, replaces } =
    note;
  const appIds = APP_REGISTRY.map((entry) => entry.id as string);
  return [
    ...extra.map((key) => `${at}: unknown key "${key}"`),
    ...(typeof app === 'string' && (app === 'site' || appIds.includes(app))
      ? []
      : [
          `${at}: app must be "site" or an app id from APP_REGISTRY, got ${JSON.stringify(app)}`,
        ]),
    ...(typeof kind === 'string' && KINDS.includes(kind)
      ? []
      : [`${at}: kind must be one of ${KINDS.join(', ')}`]),
    ...(typeof audience === 'string' && AUDIENCES.includes(audience)
      ? []
      : [`${at}: audience must be one of ${AUDIENCES.join(', ')}`]),
    ...(typeof isTold !== 'boolean'
      ? [`${at}: isTold must be true or false`]
      : isTold && kind === 'fixed'
        ? [`${at}: a fixed note is only listed; set isTold to false`]
        : []),
    ...(emoji === null || (typeof emoji === 'string' && isEmojiMark(emoji))
      ? []
      : [
          `${at}: emoji must be null or one or two emoji characters, no letters or digits`,
        ]),
    ...(isTold === true && emoji === null
      ? [`${at}: a told note needs an emoji; add one for what it is about`]
      : []),
    ...(!Array.isArray(replaces) ||
    !replaces.every((id) => typeof id === 'string')
      ? [`${at}: replaces must be a list of note ids (use [] for none)`]
      : replaces.length > WHATS_NEW_REPLACES_MAX
        ? [
            `${at}: replaces names ${replaces.length} notes; keep it to ${WHATS_NEW_REPLACES_MAX}`,
          ]
        : []),
    ...(typeof text !== 'string' || text.trim() === ''
      ? [`${at}: text must be a non-empty sentence`]
      : [
          ...(text.length > WHATS_NEW_TEXT_MAX
            ? [
                `${at}: text is ${text.length} characters; keep it to ${WHATS_NEW_TEXT_MAX}`,
              ]
            : []),
          ...(text !== text.trim()
            ? [`${at}: text has leading or trailing whitespace`]
            : []),
        ]),
    ...(path === null || (typeof path === 'string' && path.startsWith('/'))
      ? []
      : [`${at}: path must be null or an in-site route starting with "/"`]),
    ...(gate === null
      ? []
      : typeof gate !== 'string'
        ? [`${at}: gate must be null or a gate id`]
        : app === 'site'
          ? [`${at}: a "site" note has no feature switch; set gate to null`]
          : FEATURE_GATES.some(
                (entry) => entry.id === gate && entry.appId === app,
              )
            ? []
            : [
                `${at}: gate "${gate}" is not a FEATURE_GATES id of app "${String(app)}"`,
              ]),
  ];
};

const readJson = (raw: string): { value: unknown } | { error: string } => {
  try {
    return { value: JSON.parse(raw) };
  } catch (error) {
    return { error: (error as Error).message };
  }
};

/** Validates one file's text; `file` is set only when there are no errors. */
export const parseWhatsNewFile = (
  slug: string,
  raw: string,
): { file: WhatsNewFile | null; errors: string[] } => {
  const name = `${WHATS_NEW_DIR}/${slug}.json`;
  const parsed = readJson(raw);
  if ('error' in parsed)
    return {
      file: null,
      errors: [`${name}: not valid JSON (${parsed.error})`],
    };
  const value = parsed.value;
  const errors = [
    ...(SLUG.test(slug)
      ? []
      : [`${name}: the file name must be lowercase a-z, 0-9 and hyphens`]),
    ...(!isRecord(value) ||
    !Array.isArray(value.notes) ||
    value.notes.length === 0
      ? [`${name}: must be { "notes": [ ... ] } with at least one note`]
      : (value.notes as unknown[]).flatMap((note, index) =>
          checkNote(note, `${name} note ${index + 1}`),
        )),
  ];
  return errors.length > 0
    ? { file: null, errors }
    : { file: value as unknown as WhatsNewFile, errors };
};

export const readWhatsNewFiles = (): {
  files: { slug: string; notes: WhatsNewDraft[] }[];
  errors: string[];
} => {
  const results = readdirSync(WHATS_NEW_DIR)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => entry.slice(0, -'.json'.length))
    .sort()
    .map((slug) => ({
      slug,
      ...parseWhatsNewFile(
        slug,
        readFileSync(`${WHATS_NEW_DIR}/${slug}.json`, 'utf8'),
      ),
    }));
  const files = results.flatMap(({ slug, file }) =>
    file ? [{ slug, notes: file.notes }] : [],
  );
  const appById = new Map<string, string>(
    files.flatMap(({ slug, notes }) =>
      notes.map((draft, index) => [`${slug}-${index}`, draft.app]),
    ),
  );
  const replaceErrors = files.flatMap(({ slug, notes }) =>
    notes.flatMap((draft, index) =>
      draft.replaces.flatMap((id) =>
        id === `${slug}-${index}`
          ? [`${WHATS_NEW_DIR}/${slug}.json note ${index + 1}: replaces itself`]
          : !appById.has(id)
            ? [
                `${WHATS_NEW_DIR}/${slug}.json note ${index + 1}: replaces "${id}", which is not a note id of any file in ${WHATS_NEW_DIR}/ (ids are <file slug>-<index>)`,
              ]
            : appById.get(id) !== draft.app
              ? [
                  `${WHATS_NEW_DIR}/${slug}.json note ${index + 1}: replaces "${id}", a note of another app; a note can only replace one of its own app's`,
                ]
              : [],
      ),
    ),
  );
  return {
    files,
    errors: [...results.flatMap(({ errors }) => errors), ...replaceErrors],
  };
};

const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8' }).trim();

/** The commit that added the file (main is squash-merged, so the merge), its time in ms and the earliest release tag containing it; null until tagged. */
export const readFileRelease = (
  slug: string,
): { version: string; publishedAt: number } | null => {
  const [sha, seconds] = git(
    'log',
    '--diff-filter=A',
    '--format=%H %ct',
    '-1',
    '--',
    `${WHATS_NEW_DIR}/${slug}.json`,
  ).split(' ');
  if (!sha) return null;
  const tag = git(
    'tag',
    '--contains',
    sha,
    '--list',
    'v[0-9]*.[0-9]*.[0-9]*',
    '--sort=v:refname',
  ).split('\n')[0];
  return tag
    ? { version: tag.replace(/^v/, ''), publishedAt: Number(seconds) * 1000 }
    : null;
};
