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
 * prefixed or bare title is reused, keeps its board Status and its edited
 * body, and only gets its label, Apps and links. The app's name comes from
 * APP_REGISTRY, or `--app-name` before the app is registered; a missing Apps
 * option is added to the board, keeping every item's existing Apps value.
 * Needs `gh` signed in with the `project` and `read:project` scopes; the dry
 * run needs nothing.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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

interface ProjectField {
  id: string;
  name: string;
  options?: { id: string; name: string }[];
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

const gh = (args: string[]) => {
  const output = execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return output.trim();
};

const ghJson = <T>(args: string[]): T => {
  const result = JSON.parse(gh(args)) as T;
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

interface SelectOption {
  id: string;
  name: string;
  color: string;
  description: string;
}

const readOptions = (fieldId: string) => {
  const query = `query($field: ID!) { node(id: $field) { ... on ProjectV2SingleSelectField { options { id name color description } } } }`;
  const result = ghJson<{ data: { node: { options: SelectOption[] } } }>([
    'api',
    'graphql',
    '-f',
    `query=${query}`,
    '-f',
    `field=${fieldId}`,
  ]).data.node.options;
  return result;
};

// Every item's current Apps value, by option name, so it can be put back if
// rewriting the option list gives the options new ids.
const readAppsValues = (projectId: string) => {
  const query = `query($project: ID!, $endCursor: String) { node(id: $project) { ... on ProjectV2 { items(first: 100, after: $endCursor) { nodes { id fieldValueByName(name: "${APPS_FIELD}") { ... on ProjectV2ItemFieldSingleSelectValue { name } } } pageInfo { hasNextPage endCursor } } } } }`;
  const lines = gh([
    'api',
    'graphql',
    '--paginate',
    '-f',
    `query=${query}`,
    '-f',
    `project=${projectId}`,
    '--jq',
    '.data.node.items.nodes[] | select(.fieldValueByName.name != null) | [.id, .fieldValueByName.name] | @tsv',
  ]);
  const result = lines
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [itemId, name] = line.split('\t');
      return { itemId, name };
    });
  return result;
};

const ensureAppsOption = (
  projectId: string,
  fields: ProjectField[],
  appName: string,
) => {
  const appsField =
    fields.find((field) => field.name === APPS_FIELD) ??
    fail(`No "${APPS_FIELD}" field on project ${PROJECT_NUMBER}.`);
  const existing = appsField.options?.find((entry) => entry.name === appName);
  if (existing) return { fieldId: appsField.id, optionId: existing.id };

  // The API can only add an option by rewriting the whole list, and its input
  // carries no ids, so every item's value is recorded first and restored if
  // the rewrite changed the ids.
  const before = readOptions(appsField.id);
  const values = readAppsValues(projectId);
  console.log(
    `Adding "${appName}" to the board's ${APPS_FIELD} field (${values.length} items carry an ${APPS_FIELD} value)`,
  );
  const options = [
    ...before.map(({ name, color, description }) => ({
      name,
      color,
      description,
    })),
    { name: appName, color: 'GRAY', description: '' },
  ];
  const mutation = `mutation($field: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]) { updateProjectV2Field(input: { fieldId: $field, singleSelectOptions: $options }) { projectV2Field { ... on ProjectV2SingleSelectField { options { id name color description } } } } }`;
  const payload = JSON.stringify({
    query: mutation,
    variables: { field: appsField.id, options },
  });
  const after = JSON.parse(
    execFileSync('gh', ['api', 'graphql', '--input', '-'], {
      input: payload,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'inherit'],
    }),
  ).data.updateProjectV2Field.projectV2Field.options as SelectOption[];

  const idByName = new Map(after.map((option) => [option.name, option.id]));
  const idsChanged = before.some(
    (option) => idByName.get(option.name) !== option.id,
  );
  if (idsChanged) {
    console.log(
      `GitHub gave the ${APPS_FIELD} options new ids; putting back ${values.length} items' values`,
    );
    const failed = values.filter(({ itemId, name }) => {
      try {
        gh([
          'project',
          'item-edit',
          '--id',
          itemId,
          '--project-id',
          projectId,
          '--field-id',
          appsField.id,
          '--single-select-option-id',
          idByName.get(name) ?? '',
        ]);
        return false;
      } catch {
        return true;
      }
    });
    if (failed.length > 0)
      fail(
        `Couldn't put back ${failed.length} ${APPS_FIELD} values. Set these by hand (item id, app):\n${failed.map(({ itemId, name }) => `  ${itemId}\t${name}`).join('\n')}`,
      );
  }
  const optionId =
    idByName.get(appName) ??
    fail(`The new ${APPS_FIELD} option did not come back.`);
  const result = { fieldId: appsField.id, optionId };
  return result;
};

const run = async () => {
  const { appId, file, appName: givenName, skipConfirm } = readArgs();
  if (!appId)
    fail(
      'Usage: npm run issues:create -- <app-id> [--app-name <name>] [--file <path>] [--yes]',
    );

  const app = APP_REGISTRY.find((entry) => entry.id === appId);
  const appName =
    givenName ??
    app?.name ??
    fail(
      `No app "${appId}" in APP_REGISTRY yet. Pass --app-name "<App name>" (the name people will see).`,
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
  if (
    !skipConfirm &&
    !(await confirm(
      `Create or update these in ${repo} and put them on project ${PROJECT_NUMBER}?`,
    ))
  ) {
    console.log('Stopped.');
    return;
  }

  const projectId = gh([
    'project',
    'view',
    String(PROJECT_NUMBER),
    '--owner',
    owner,
    '--format',
    'json',
    '--jq',
    '.id',
  ]);
  const fields = ghJson<{ fields: ProjectField[] }>([
    'project',
    'field-list',
    String(PROJECT_NUMBER),
    '--owner',
    owner,
    '--format',
    'json',
  ]).fields;
  const statusField =
    fields.find((field) => field.name === STATUS_FIELD) ??
    fail(`No "${STATUS_FIELD}" field on the board.`);
  const statusOption =
    statusField.options?.find((option) => option.name === STATUS_VALUE) ??
    fail(`No "${STATUS_VALUE}" status on the board.`);
  const apps = ensureAppsOption(projectId, fields, appName);

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
    (map, issue) =>
      map.set(issue.title, [...(map.get(issue.title) ?? []), issue]),
    new Map<string, typeof existingIssues>(),
  );
  // An issue made before titles carried the app prefix is adopted by its bare
  // title only when that title is unique, so a common title is never taken
  // from another app.
  const findExisting = (title: string, bareTitle: string) => {
    const prefixed = issuesByTitle.get(title) ?? [];
    if (prefixed.length > 0) return prefixed[0];
    const bare = issuesByTitle.get(bareTitle) ?? [];
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

  created.forEach(({ url, isNew }) => {
    const itemId = gh([
      'project',
      'item-add',
      String(PROJECT_NUMBER),
      '--owner',
      owner,
      '--url',
      url,
      '--format',
      'json',
      '--jq',
      '.id',
    ]);
    if (isNew)
      gh([
        'project',
        'item-edit',
        '--id',
        itemId,
        '--project-id',
        projectId,
        '--field-id',
        statusField.id,
        '--single-select-option-id',
        statusOption.id,
      ]);
    gh([
      'project',
      'item-edit',
      '--id',
      itemId,
      '--project-id',
      projectId,
      '--field-id',
      apps.fieldId,
      '--single-select-option-id',
      apps.optionId,
    ]);
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
