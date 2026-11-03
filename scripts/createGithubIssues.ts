/**
 * Creates an app's roadmap issues from its ISSUES.md and puts them on the
 * project board, so planning ends in real issues with one command.
 *
 *   npm run issues:create -- <app-id> [--app-name <name>] [--file <path>] [--yes]
 *   npm run issues:create:dry-run -- <app-id> [--file <path>]
 *
 * ISSUES.md holds `### Issue N: Title` sections under `## <Tier>` headings
 * (MVP, Next Steps, Beyond). Each issue is created as `<App name> N: Title`,
 * labelled with its tier and added to the board with Apps set and, when new,
 * Status set; once all exist, every `Issue N` left in a body (as it stands on
 * GitHub) becomes the real `#123`. Re-running is safe: an issue found by its
 * prefixed (`<App> N: Title` or the older `<App>: Title`) or bare title,
 * compared without case, is reused, keeps its board Status and its edited
 * body, and only gets its label, Apps and links. The app's name comes from
 * APP_REGISTRY, `--app-name`, or the first heading of the app's README.md
 * before the app is registered; a missing Apps option is added to the board,
 * keeping every item's existing Apps value. Needs `gh` signed in with the
 * `project` and `read:project` scopes, or PROJECT_TOKEN set for the board
 * calls (the create-app-issues workflow); the dry run needs nothing.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { APP_REGISTRY } from '../src/lib/app/app.registry.ts';

const PROJECT_NUMBER = 3;
const STATUS_FIELD = 'Status';
const STATUS_VALUE = 'Ready';
const APPS_FIELD = 'Apps';

interface RoadmapIssue {
  number: number;
  title: string;
  tier: string | null;
  body: string;
}

interface SelectOption {
  id: string;
  name: string;
  color: string;
  description: string;
}

type FieldKind = 'single' | 'multi' | 'other';

interface ProjectField {
  id: string;
  name: string;
  kind: FieldKind;
  options: SelectOption[] | null;
}

interface RawField {
  __typename: string;
  id?: string;
  name?: string;
  options?: SelectOption[];
  multiSelectOptions?: SelectOption[];
}

const isDryRun =
  (process.env.npm_lifecycle_event ?? '').includes('dry-run') ||
  process.argv.includes('--dry-run');

const VALUE_FLAGS = ['--file', '--app-name'];

const readArgs = () => {
  const args = process.argv.slice(2).filter((arg) => arg !== '--dry-run');
  const readValue = (flag: string) => {
    const index = args.indexOf(flag);
    if (index < 0) return null;
    const value = args[index + 1] ?? null;
    if (!value || value.startsWith('--')) fail(`${flag} needs a value.`);
    return value;
  };
  const appId =
    args.find(
      (arg, index) =>
        !arg.startsWith('--') && !VALUE_FLAGS.includes(args[index - 1]),
    ) ?? null;
  const result = {
    appId,
    file: readValue('--file'),
    appName: readValue('--app-name'),
    skipConfirm: args.includes('--yes'),
  };
  return result;
};

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

// The workflow's own token can't reach a user-owned board, so board calls use
// PROJECT_TOKEN when it is set and issue calls keep the workflow's token.
const isBoardCall = (args: string[]) =>
  args[0] === 'api' && args[1] === 'graphql';

const ghEnv = (args: string[]) =>
  process.env.PROJECT_TOKEN && isBoardCall(args)
    ? { ...process.env, GH_TOKEN: process.env.PROJECT_TOKEN }
    : process.env;

const gh = (args: string[]) => {
  const output = execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: ghEnv(args),
  });
  return output.trim();
};

const ghJson = <T>(args: string[]): T => {
  const result = JSON.parse(gh(args)) as T;
  return result;
};

// Board calls are plain GraphQL: `gh project` can fail to resolve a user-owned
// board with a token that has the project scope ("unknown owner type").
const boardQuery = <T>(query: string, variables: Record<string, unknown>) => {
  const args = ['api', 'graphql', '--input', '-'];
  const output = execFileSync('gh', args, {
    input: JSON.stringify({ query, variables }),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit'],
    env: ghEnv(args),
  });
  const result = (JSON.parse(output) as { data: T }).data;
  return result;
};

const OPTION_FIELDS = 'id name color description';
const FIELD_SELECTION = `__typename ... on ProjectV2FieldCommon { id name } ... on ProjectV2SingleSelectField { options { ${OPTION_FIELDS} } } ... on ProjectV2MultiSelectField { multiSelectOptions { ${OPTION_FIELDS} } }`;

const toField = (node: RawField): ProjectField => {
  const kinds: Record<string, FieldKind> = {
    ProjectV2SingleSelectField: 'single',
    ProjectV2MultiSelectField: 'multi',
  };
  const result = {
    id: node.id ?? '',
    name: node.name ?? '',
    kind: kinds[node.__typename] ?? 'other',
    options: node.options ?? node.multiSelectOptions ?? null,
  };
  return result;
};

const readProject = (login: string) => {
  const query = `query($login: String!, $number: Int!) { user(login: $login) { projectV2(number: $number) { id fields(first: 50) { nodes { ${FIELD_SELECTION} } } } } }`;
  const project =
    boardQuery<{
      user: {
        projectV2: { id: string; fields: { nodes: RawField[] } } | null;
      };
    }>(query, { login, number: PROJECT_NUMBER }).user.projectV2 ??
    fail(`${login} has no project ${PROJECT_NUMBER}.`);
  const result = { id: project.id, fields: project.fields.nodes.map(toField) };
  return result;
};

// A single-select field holds one option and a multi-select field a list.
const setOptions = (
  projectId: string,
  itemId: string,
  field: { id: string; kind: FieldKind },
  optionIds: string[],
) =>
  boardQuery(
    `mutation($project: ID!, $item: ID!, $field: ID!, $value: ProjectV2FieldValue!) { updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: $value }) { projectV2Item { id } } }`,
    {
      project: projectId,
      item: itemId,
      field: field.id,
      value:
        field.kind === 'multi'
          ? { multiSelectOptionIds: optionIds }
          : { singleSelectOptionId: optionIds[0] },
    },
  );

const VALUE_SELECTION = `... on ProjectV2ItemFieldSingleSelectValue { optionId } ... on ProjectV2ItemFieldMultiSelectValue { options { id } }`;

const toOptionIds = (
  value: { optionId?: string; options?: { id: string }[] } | null,
) => {
  const result = value?.options?.map((option) => option.id) ?? (value?.optionId ? [value.optionId] : []);
  return result;
};

const addToProject = (projectId: string, contentId: string) => {
  const item = boardQuery<{
    addProjectV2ItemById: {
      item: {
        id: string;
        apps: { optionId?: string; options?: { id: string }[] } | null;
      };
    };
  }>(
    `mutation($project: ID!, $content: ID!) { addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id apps: fieldValueByName(name: "${APPS_FIELD}") { ${VALUE_SELECTION} } } } }`,
    { project: projectId, content: contentId },
  ).addProjectV2ItemById.item;
  const result = { id: item.id, appsOptionIds: toOptionIds(item.apps) };
  return result;
};

const parseRoadmap = (text: string): RoadmapIssue[] => {
  const lines = text.split('\n');
  const issueHeading = /^### Issue (\d+): (.*)$/;
  const tierHeading = /^## (.+)$/;

  const state = lines.reduce<{
    issues: RoadmapIssue[];
    tier: string | null;
    current: RoadmapIssue | null;
  }>(
    (acc, line) => {
      const issueMatch = line.match(issueHeading);
      if (issueMatch) {
        const current = {
          number: Number(issueMatch[1]),
          title: issueMatch[2].trim(),
          tier: acc.tier,
          body: '',
        };
        return {
          issues: acc.current ? [...acc.issues, acc.current] : acc.issues,
          tier: acc.tier,
          current,
        };
      }
      const tierMatch = line.match(tierHeading);
      if (tierMatch) {
        return {
          issues: acc.current ? [...acc.issues, acc.current] : acc.issues,
          tier: toTierLabel(tierMatch[1]),
          current: null,
        };
      }
      if (acc.current) {
        acc.current.body += line + '\n';
      }
      return acc;
    },
    { issues: [], tier: null, current: null },
  );

  const issues = state.current
    ? [...state.issues, state.current]
    : state.issues;
  const result = issues.map((issue) => ({
    ...issue,
    body: issue.body.trim() + '\n',
  }));
  return result;
};

const TIERS = ['MVP', 'Next Steps', 'Beyond'];

const toTierLabel = (heading: string) => {
  const cleaned = heading
    .replace(/^Tier:\s*/i, '')
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/\s+Tier$/i, '')
    .trim();
  const result =
    TIERS.find((tier) =>
      cleaned.toLowerCase().startsWith(tier.toLowerCase()),
    ) ?? cleaned;
  return result;
};

const toGithubTitle = (appName: string, issue: RoadmapIssue) =>
  `${appName} ${issue.number}: ${issue.title}`;

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "Pinch Issue 3" points at another roadmap, and code shows text as written,
// so neither is turned into this roadmap's issue number.
const OTHER_ROADMAP_PREFIX = APP_REGISTRY.flatMap((entry) => [
  entry.name,
  entry.id,
])
  .map(escapeRegExp)
  .join('|');
const ISSUE_MENTION = new RegExp(
  `(?<!\\b(?:${OTHER_ROADMAP_PREFIX}) )\\bIssue (\\d+)\\b`,
  'gi',
);

const linkIssueMentions = (
  body: string,
  numbersByRoadmap: Map<number, number>,
) => {
  const linkProse = (text: string) =>
    text.replace(ISSUE_MENTION, (match, roadmapNumber: string) => {
      const real = numbersByRoadmap.get(Number(roadmapNumber));
      return real ? `#${real}` : match;
    });
  const result = body
    .split(/(```[\s\S]*?```)/)
    .map((part) => (part.startsWith('```') ? part : linkProse(part)))
    .join('');
  return result;
};

const confirm = async (question: string) => {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await readline.question(`${question} (y/N) `);
  readline.close();
  const result = /^y(es)?$/i.test(answer.trim());
  return result;
};

const ensureLabel = (repo: string, label: string, existing: Set<string>) => {
  if (existing.has(label)) return;
  console.log(`Creating label "${label}"`);
  gh(['label', 'create', label, '--repo', repo]);
  existing.add(label);
};

const readOptions = (fieldId: string) => {
  const node = boardQuery<{ node: RawField | null }>(
    `query($field: ID!) { node(id: $field) { ${FIELD_SELECTION} } }`,
    { field: fieldId },
  ).node;
  const result =
    (node ? toField(node).options : null) ??
    fail(
      `The board's ${APPS_FIELD} field (${fieldId}) is a ${node?.__typename ?? 'missing node'}, not a select field, so its options can't be read.`,
    );
  return result;
};

interface ItemsPage {
  node: {
    items: {
      nodes: {
        id: string;
        apps: { optionId?: string; options?: { id: string }[] } | null;
      }[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
}

// Every item's current Apps option ids, so they can be put back if rewriting
// the option list gives the options new ids.
const readAppsValues = (
  projectId: string,
  after: string | null = null,
): { itemId: string; optionIds: string[] }[] => {
  const page = boardQuery<ItemsPage>(
    `query($project: ID!, $after: String) { node(id: $project) { ... on ProjectV2 { items(first: 100, after: $after) { nodes { id apps: fieldValueByName(name: "${APPS_FIELD}") { ${VALUE_SELECTION} } } pageInfo { hasNextPage endCursor } } } } }`,
    { project: projectId, after },
  ).node.items;
  const values = page.nodes
    .map((item) => ({ itemId: item.id, optionIds: toOptionIds(item.apps) }))
    .filter(({ optionIds }) => optionIds.length > 0);
  const result = page.pageInfo.hasNextPage
    ? [...values, ...readAppsValues(projectId, page.pageInfo.endCursor)]
    : values;
  return result;
};

interface AppsBackup {
  fieldId: string;
  kind: FieldKind;
  projectId: string;
  before: SelectOption[];
  values: { itemId: string; optionIds: string[] }[];
}

const backupPath = (fieldId: string) =>
  join(tmpdir(), `apps-field-backup-${fieldId}.json`);

// Old ids map to new ones by position: the rewrite sends the old list in
// order with the new option last, so this holds even for duplicate names.
const restoreAppsValues = (backup: AppsBackup, after: SelectOption[]) => {
  const isAligned = backup.before.every(
    (option, index) => after[index]?.name === option.name,
  );
  if (!isAligned)
    fail(
      `The board's ${APPS_FIELD} options no longer line up with the backup at ${backupPath(backup.fieldId)}, so items' values can't be matched. Put them back from that file by hand.`,
    );
  const newIdByOld = new Map(
    backup.before.map((option, index) => [option.id, after[index]?.id ?? option.id]),
  );
  const moved = backup.values.filter(({ optionIds }) =>
    optionIds.some((id) => newIdByOld.get(id) !== id),
  );
  if (moved.length === 0) return;
  console.log(
    `GitHub gave the ${APPS_FIELD} options new ids; putting back ${moved.length} items' values`,
  );
  const failed = moved.filter(({ itemId, optionIds }) => {
    try {
      setOptions(
        backup.projectId,
        itemId,
        { id: backup.fieldId, kind: backup.kind },
        optionIds.map((id) => newIdByOld.get(id) ?? id),
      );
      return false;
    } catch {
      return true;
    }
  });
  if (failed.length > 0)
    fail(
      `Couldn't put back ${failed.length} ${APPS_FIELD} values. Run this again to retry from the backup at ${backupPath(backup.fieldId)}.`,
    );
};

interface AppsPlan {
  fieldId: string;
  kind: FieldKind;
  optionId: string | null;
  backup: AppsBackup | null;
  resumed: AppsBackup | null;
}

const planAppsOption = (
  projectId: string,
  fields: ProjectField[],
  appName: string,
): AppsPlan => {
  const appsField =
    fields.find((field) => field.name === APPS_FIELD) ??
    fail(`No "${APPS_FIELD}" field on project ${PROJECT_NUMBER}.`);
  const resumed = existsSync(backupPath(appsField.id))
    ? (JSON.parse(readFileSync(backupPath(appsField.id), 'utf8')) as AppsBackup)
    : null;
  const existing = appsField.options?.find((entry) => entry.name === appName);
  if (appsField.kind === 'other')
    fail(`The board's ${APPS_FIELD} field is not a select field.`);
  if (existing)
    return {
      fieldId: appsField.id,
      kind: appsField.kind,
      optionId: existing.id,
      backup: null,
      resumed,
    };
  const backup = {
    fieldId: appsField.id,
    kind: appsField.kind,
    projectId,
    before: readOptions(appsField.id),
    values: readAppsValues(projectId),
  };
  const result = {
    fieldId: appsField.id,
    kind: appsField.kind,
    optionId: null,
    backup,
    resumed,
  };
  return result;
};

// The API adds an option only by rewriting the whole list. A multi-select
// list keeps the ids it is sent, a single-select one may not, so every item's
// value is saved to disk first and restored from it, on this run or, when this
// run is cut short, on the next.
const applyAppsOption = (plan: AppsPlan, appName: string) => {
  if (plan.resumed) {
    console.log(
      `Finishing an earlier ${APPS_FIELD} change from ${backupPath(plan.fieldId)}`,
    );
    restoreAppsValues(plan.resumed, readOptions(plan.fieldId));
    unlinkSync(backupPath(plan.fieldId));
  }
  const field = { fieldId: plan.fieldId, kind: plan.kind };
  if (plan.optionId) return { ...field, optionId: plan.optionId };
  const backup = plan.backup ?? fail(`No plan for the ${APPS_FIELD} option.`);
  writeFileSync(backupPath(plan.fieldId), JSON.stringify(backup));
  console.log(
    `Adding "${appName}" to the board's ${APPS_FIELD} field (${backup.values.length} items' values backed up at ${backupPath(plan.fieldId)})`,
  );
  const isMulti = plan.kind === 'multi';
  const options = [
    ...backup.before.map(({ id, name, color, description }) =>
      isMulti ? { id, name, color, description } : { name, color, description },
    ),
    { name: appName, color: 'GRAY', description: '' },
  ];
  const optionsInput = isMulti
    ? 'multiSelectOptions: [ProjectV2MultiSelectFieldOptionInput!]'
    : 'singleSelectOptions: [ProjectV2SingleSelectFieldOptionInput!]';
  const [optionsKey, optionsType] = optionsInput.split(': ');
  boardQuery(
    `mutation($field: ID!, $options: ${optionsType}) { updateProjectV2Field(input: { fieldId: $field, ${optionsKey}: $options }) { projectV2Field { __typename } } }`,
    { field: plan.fieldId, options },
  );
  const after = readOptions(plan.fieldId);
  restoreAppsValues(backup, after);
  unlinkSync(backupPath(plan.fieldId));
  const optionId =
    after[backup.before.length]?.id ??
    fail(`The new ${APPS_FIELD} option did not come back.`);
  const result = { ...field, optionId };
  return result;
};

// "# Going Once 🔨" names the app before it is registered; the emoji is dropped.
const readNameFromReadme = (appId: string) => {
  const readme = `src/apps/${appId}/README.md`;
  if (!existsSync(readme)) return null;
  const heading = readFileSync(readme, 'utf8').match(/^# (.+)$/m)?.[1] ?? '';
  const result =
    heading
      .replace(/[^\p{L}\p{N}'&.\- ]/gu, '')
      .replace(/\s+/g, ' ')
      .trim() || null;
  return result;
};

const run = async () => {
  const { appId: givenId, file, appName: givenName, skipConfirm } = readArgs();
  const appId =
    givenId ??
    fail(
      'Usage: npm run issues:create -- <app-id> [--app-name <name>] [--file <path>] [--yes]',
    );

  const app = APP_REGISTRY.find((entry) => entry.id === appId);
  const appName =
    givenName ??
    app?.name ??
    readNameFromReadme(appId) ??
    fail(
      `No app "${appId}" in APP_REGISTRY yet and no "# Name" heading in its README.md. Pass --app-name "<App name>" (the name people will see).`,
    );
  const issuesFile = file ?? `src/apps/${appId}/ISSUES.md`;
  if (!existsSync(issuesFile)) fail(`No roadmap at ${issuesFile}.`);

  const issues = parseRoadmap(readFileSync(issuesFile, 'utf8'));
  if (issues.length === 0)
    fail(`No "### Issue N: Title" sections in ${issuesFile}.`);

  console.log(`${issues.length} issues in ${issuesFile} for ${appName}:\n`);
  issues.forEach((issue) =>
    console.log(
      `  [${issue.tier ?? 'no tier'}] ${toGithubTitle(appName, issue)}`,
    ),
  );
  console.log('');

  if (isDryRun) {
    console.log('Dry run: nothing was created.');
    return;
  }

  const repo = gh([
    'repo',
    'view',
    '--json',
    'nameWithOwner',
    '--jq',
    '.nameWithOwner',
  ]);
  const owner = repo.split('/')[0];
  const { id: projectId, fields } = readProject(owner);
  const statusField =
    fields.find((field) => field.name === STATUS_FIELD) ??
    fail(`No "${STATUS_FIELD}" field on the board.`);
  const statusOption =
    statusField.options?.find((option) => option.name === STATUS_VALUE) ??
    fail(`No "${STATUS_VALUE}" status on the board.`);
  const appsPlan = planAppsOption(projectId, fields, appName);
  const appsNote = appsPlan.backup
    ? `, and add "${appName}" to the board's ${APPS_FIELD} field (GitHub rewrites the field to do it; ${appsPlan.backup.values.length} items' ${APPS_FIELD} values are saved first and put back)`
    : '';
  if (
    !skipConfirm &&
    !(await confirm(
      `Create or update these in ${repo} and put them on project ${PROJECT_NUMBER}${appsNote}?`,
    ))
  ) {
    console.log('Stopped.');
    return;
  }
  const apps = applyAppsOption(appsPlan, appName);

  const labels = new Set(
    gh([
      'label',
      'list',
      '--repo',
      repo,
      '--limit',
      '500',
      '--json',
      'name',
      '--jq',
      '.[].name',
    ]).split('\n'),
  );
  const ISSUE_LIST_LIMIT = 2000;
  const existingIssues = ghJson<
    { title: string; number: number; url: string; body: string }[]
  >([
    'issue',
    'list',
    '--repo',
    repo,
    '--state',
    'all',
    '--limit',
    String(ISSUE_LIST_LIMIT),
    '--json',
    'title,number,url,body',
  ]);
  if (existingIssues.length >= ISSUE_LIST_LIMIT)
    fail(
      `The repo has ${ISSUE_LIST_LIMIT}+ issues, so existing ones may be missed and duplicated. Raise ISSUE_LIST_LIMIT first.`,
    );
  const issuesByTitle = existingIssues.reduce(
    (map, issue) => {
      const key = issue.title.toLowerCase();
      return map.set(key, [...(map.get(key) ?? []), issue]);
    },
    new Map<string, typeof existingIssues>(),
  );
  // Older roadmaps were titled "<App>: Title" with no number, so that form is
  // adopted too. An issue made before titles carried the app prefix is adopted
  // by its bare title only when that title is unique, so a common title is
  // never taken from another app.
  const findExisting = (title: string, bareTitle: string) => {
    const prefixed = [
      ...(issuesByTitle.get(title.toLowerCase()) ?? []),
      ...(issuesByTitle.get(`${appName}: ${bareTitle}`.toLowerCase()) ?? []),
    ];
    if (prefixed.length > 0) return prefixed[0];
    const bare = issuesByTitle.get(bareTitle.toLowerCase()) ?? [];
    if (bare.length > 1)
      console.log(
        `  ${bare.length} issues are titled "${bareTitle}"; adopting none, so a new one is created.`,
      );
    const result = bare.length === 1 ? bare[0] : null;
    return result;
  };

  const created = issues.map((issue) => {
    const title = toGithubTitle(appName, issue);
    if (issue.tier) ensureLabel(repo, issue.tier, labels);
    const existing = findExisting(title, issue.title);
    if (existing) {
      console.log(`Exists: #${existing.number} ${existing.title}`);
      if (issue.tier)
        gh([
          'issue',
          'edit',
          String(existing.number),
          '--repo',
          repo,
          '--add-label',
          issue.tier,
        ]);
      return {
        issue,
        number: existing.number,
        url: existing.url,
        body: existing.body,
        isNew: false,
      };
    }
    const createArgs = [
      'issue',
      'create',
      '--repo',
      repo,
      '--title',
      title,
      '--body',
      issue.body,
    ];
    const url = gh(
      issue.tier ? [...createArgs, '--label', issue.tier] : createArgs,
    );
    const number = Number(url.split('/').pop());
    console.log(`Created: #${number} ${title}`);
    return { issue, number, url, body: issue.body, isNew: true };
  });

  created.forEach(({ number, isNew }) => {
    const contentId = gh([
      'issue',
      'view',
      String(number),
      '--repo',
      repo,
      '--json',
      'id',
      '--jq',
      '.id',
    ]);
    const item = addToProject(projectId, contentId);
    if (isNew) setOptions(projectId, item.id, statusField, [statusOption.id]);
    if (!item.appsOptionIds.includes(apps.optionId))
      setOptions(
        projectId,
        item.id,
        { id: apps.fieldId, kind: apps.kind },
        apps.kind === 'multi'
          ? [...item.appsOptionIds, apps.optionId]
          : [apps.optionId],
      );
  });

  const numbersByRoadmap = new Map(
    created.map(({ issue, number }) => [issue.number, number] as const),
  );
  const relinked = created.filter(({ number, body }) => {
    const linked = linkIssueMentions(body, numbersByRoadmap);
    if (linked === body) return false;
    gh(['issue', 'edit', String(number), '--repo', repo, '--body', linked]);
    return true;
  });

  console.log(
    `\nDone: ${created.filter(({ isNew }) => isNew).length} created, ${created.length} on the board, ${relinked.length} bodies linked.`,
  );
  created.forEach(({ issue, number }) =>
    console.log(`  Issue ${issue.number} → #${number}`),
  );
};

run();
