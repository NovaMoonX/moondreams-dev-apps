// Puts an issue on the owner's project board with its Apps field set from its
// "<App name> (App)" label, and Status "Ready" when the item is new.
//
//   node scripts/board/run.ts --issue 537   # needs PROJECT_TOKEN, GH_TOKEN and REPO (owner/name)
//   node scripts/board/run.ts --all         # every open issue with an app label
//   add --dry-run to print what would change

import { findOption, readAppName, type SelectField } from './board.ts';

const PROJECT_NUMBER = 3;
const STATUS_FIELD = 'Status';
const STATUS_VALUE = 'Ready';
const APPS_FIELD = 'Apps';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isAll = args.includes('--all');
const issueArg = args.includes('--issue')
  ? Number(args[args.indexOf('--issue') + 1])
  : null;

const repo = process.env.REPO ?? '';
const projectToken = process.env.PROJECT_TOKEN ?? '';
const repoToken = process.env.GH_TOKEN ?? projectToken;
const login = repo.split('/')[0];

interface Issue {
  number: number;
  node_id: string;
  title: string;
  state: string;
  labels: { name: string }[];
  pull_request?: unknown;
}

const rest = async <T>(path: string): Promise<T> => {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${repoToken}`,
      accept: 'application/vnd.github+json',
    },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200);
    throw new Error(`GET ${path}: ${response.status} ${detail}`);
  }
  return (await response.json()) as T;
};

const graphql = async <T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> => {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${projectToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await response.text();
  const body = (() => {
    try {
      return JSON.parse(text) as { data?: T; errors?: { message: string }[] };
    } catch {
      return {
        errors: [{ message: `${response.status} ${text.slice(0, 200)}` }],
      };
    }
  })();
  if (!response.ok || body.errors?.length) {
    throw new Error(
      body.errors?.map((error) => error.message).join('; ') ??
        `GraphQL ${response.status}`,
    );
  }
  return body.data as T;
};

const readProject = async () => {
  const data = await graphql<{
    user: {
      projectV2: {
        id: string;
        fields: { nodes: (SelectField | Record<string, never>)[] };
      } | null;
    };
  }>(
    `
      query ($login: String!, $number: Int!) {
        user(login: $login) {
          projectV2(number: $number) {
            id
            fields(first: 50) {
              nodes {
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    `,
    { login, number: PROJECT_NUMBER },
  );
  const project = data.user.projectV2;
  if (!project) throw new Error(`${login} has no project ${PROJECT_NUMBER}`);
  const fields = project.fields.nodes.filter(
    (node): node is SelectField => 'options' in node,
  );
  return {
    id: project.id,
    apps: fields.find((field) => field.name === APPS_FIELD),
    status: fields.find((field) => field.name === STATUS_FIELD),
  };
};

type Project = Awaited<ReturnType<typeof readProject>>;

const setOption = (
  project: Project,
  itemId: string,
  fieldId: string,
  optionId: string,
) =>
  graphql(
    `
      mutation ($project: ID!, $item: ID!, $field: ID!, $option: String!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $project
            itemId: $item
            fieldId: $field
            value: { singleSelectOptionId: $option }
          }
        ) {
          projectV2Item {
            id
          }
        }
      }
    `,
    { project: project.id, item: itemId, field: fieldId, option: optionId },
  );

const placeIssue = async (project: Project, issue: Issue) => {
  if (issue.pull_request || issue.state !== 'open') {
    console.log(`#${issue.number}: not an open issue, left as it is`);
    return;
  }
  const appName = readAppName(issue.labels.map((label) => label.name));
  if (appName === null) {
    console.log(
      `#${issue.number}: no single "<App> (App)" label, left off the board`,
    );
    return;
  }
  const apps = findOption(project.apps, appName);
  if (isDryRun) {
    console.log(
      `#${issue.number}: would add with ${APPS_FIELD} "${apps?.name ?? `${appName} (missing)`}"`,
    );
    return;
  }
  const added = await graphql<{
    addProjectV2ItemById: {
      item: {
        id: string;
        status: { name: string } | null;
        apps: { name: string } | null;
      };
    };
  }>(
    `mutation($project: ID!, $content: ID!) {
      addProjectV2ItemById(input: { projectId: $project, contentId: $content }) {
        item {
          id
          status: fieldValueByName(name: "${STATUS_FIELD}") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
          apps: fieldValueByName(name: "${APPS_FIELD}") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
        }
      }
    }`,
    { project: project.id, content: issue.node_id },
  );
  const item = added.addProjectV2ItemById.item;
  if (item.apps) {
    console.log(
      `#${issue.number}: ${APPS_FIELD} already "${item.apps.name}", kept`,
    );
  } else if (apps && project.apps) {
    await setOption(project, item.id, project.apps.id, apps.id);
  } else {
    console.log(
      `::warning::#${issue.number}: the board has no ${APPS_FIELD} option "${appName}". Add it on the board (or run npm run issues:create for a new app) and re-run.`,
    );
  }
  const ready = findOption(project.status, STATUS_VALUE);
  if (!item.status && ready && project.status) {
    await setOption(project, item.id, project.status.id, ready.id);
  }
  console.log(
    `#${issue.number}: on the board${apps ? ` as ${apps.name}` : ''}${item.status ? '' : `, ${STATUS_VALUE}`}`,
  );
};

const listOpenIssues = async (page = 1): Promise<Issue[]> => {
  const batch = await rest<Issue[]>(
    `/repos/${repo}/issues?state=open&per_page=100&page=${page}`,
  );
  const issues = batch.filter((issue) => !issue.pull_request);
  return batch.length < 100
    ? issues
    : [...issues, ...(await listOpenIssues(page + 1))];
};

const main = async () => {
  if (!repo || (!isAll && !issueArg)) {
    throw new Error('Pass --issue <number> or --all, with REPO set');
  }
  if (!projectToken) {
    console.log(
      '::warning::PROJECT_TOKEN is not set, so issues are not added to the board. Add a classic token with the project scope (and repo, if the repository is private) as a repository secret.',
    );
    return;
  }
  const project = await readProject();
  const issues = isAll
    ? await listOpenIssues()
    : [await rest<Issue>(`/repos/${repo}/issues/${issueArg}`)];
  const failed = await issues.reduce<Promise<number[]>>(
    (previous, issue) =>
      previous.then((numbers) =>
        placeIssue(project, issue).then(
          () => numbers,
          (error: unknown) => {
            console.log(
              `::error::#${issue.number}: ${error instanceof Error ? error.message : String(error)}`,
            );
            return [...numbers, issue.number];
          },
        ),
      ),
    Promise.resolve([]),
  );
  if (failed.length > 0) {
    throw new Error(`Not placed: ${failed.map((n) => `#${n}`).join(', ')}`);
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
