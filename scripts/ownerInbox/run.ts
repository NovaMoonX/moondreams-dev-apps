// Rebuilds the "📥 Owner inbox" issue from every open PR's 📋 Status comment.
//
//   node scripts/ownerInbox/run.ts                 # needs GH_TOKEN and REPO (owner/name)
//   node scripts/ownerInbox/run.ts --dry-run       # prints the body instead of writing it
//   node scripts/ownerInbox/run.ts --from prs.json # builds from saved PRs with their raw status
//                                                  # comments (implies --dry-run)

import { readFileSync } from 'node:fs';

import {
  INBOX_MARKER,
  STATUS_MARKER,
  buildInbox,
  findSessionLink,
  parseStatus,
  summarizeCi,
  type CheckRun,
  type CiState,
  type InboxPr,
} from './inbox.ts';

const INBOX_LABEL = 'owner-inbox';
const INBOX_TITLE = '📥 Owner inbox';
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

const args = process.argv.slice(2);
const fromFile = args.includes('--from')
  ? args[args.indexOf('--from') + 1]
  : null;
const isDryRun = args.includes('--dry-run') || fromFile !== null;
const repo = process.env.REPO ?? '';
const token = process.env.GH_TOKEN ?? '';

const api = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(
      `${init.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
};

interface ApiPull {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  draft: boolean;
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  base: { ref: string };
  labels: { name: string }[];
}
interface ApiComment {
  body: string;
  updated_at: string;
  author_association: string;
}
interface ApiCheckRuns {
  check_runs: CheckRun[];
}
interface ApiIssue {
  number: number;
  body: string | null;
  node_id: string;
  pull_request?: unknown;
}

const getCi = async (sha: string): Promise<CiState> => {
  const { check_runs: runs } = await api<ApiCheckRuns>(
    `/repos/${repo}/commits/${sha}/check-runs?per_page=100`,
  );
  return summarizeCi(runs);
};

const readPr = async (pull: ApiPull): Promise<InboxPr> => {
  const comments = await api<ApiComment[]>(
    `/repos/${repo}/issues/${pull.number}/comments?per_page=100`,
  );
  const status = comments.find(
    (comment) =>
      comment.body.includes(STATUS_MARKER) &&
      TRUSTED.has(comment.author_association),
  );
  return {
    number: pull.number,
    title: pull.title,
    url: pull.html_url,
    head: pull.head.ref,
    base: pull.base.ref,
    isDraft: pull.draft,
    labels: pull.labels.map((label) => label.name),
    ci: await getCi(pull.head.sha),
    bodySessionUrl: findSessionLink(pull.body),
    status: status ? parseStatus(status.body, status.updated_at) : null,
  };
};

const readOpenPrs = async (): Promise<InboxPr[]> => {
  const pulls = await api<ApiPull[]>(
    `/repos/${repo}/pulls?state=open&per_page=100`,
  );
  const own = pulls.filter((pull) => pull.head.repo?.full_name === repo);
  return Promise.all(own.map(readPr));
};

const writeInbox = async (body: string) => {
  const issues = await api<ApiIssue[]>(
    `/repos/${repo}/issues?state=open&labels=${INBOX_LABEL}&per_page=10`,
  );
  const found = issues.find(
    (issue) => !issue.pull_request && issue.body?.includes(INBOX_MARKER),
  );
  if (found) {
    if (found.body === body)
      return console.log(`#${found.number} is already current`);
    await api(`/repos/${repo}/issues/${found.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    });
    return console.log(`Updated #${found.number}`);
  }
  await api(`/repos/${repo}/labels`, {
    method: 'POST',
    body: JSON.stringify({
      name: INBOX_LABEL,
      color: '1D76DB',
      description: 'The owner inbox, rebuilt by a workflow',
    }),
  }).catch(() => undefined);
  const created = await api<ApiIssue>(`/repos/${repo}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title: INBOX_TITLE, body, labels: [INBOX_LABEL] }),
  });
  // Pinning needs GraphQL and a token allowed to pin; an unpinned inbox still works.
  await api('/graphql', {
    method: 'POST',
    body: JSON.stringify({
      query:
        'mutation($id: ID!) { pinIssue(input: { issueId: $id }) { issue { number } } }',
      variables: { id: created.node_id },
    }),
  }).catch((error) =>
    console.log(`::warning::Couldn't pin #${created.number}: ${error}`),
  );
  console.log(`Created #${created.number}`);
};

type SavedPr = Omit<InboxPr, 'status'> & {
  statusBody: string | null;
  statusUpdatedAt: string;
};

const readSaved = (path: string): InboxPr[] =>
  (JSON.parse(readFileSync(path, 'utf8')) as SavedPr[]).map(
    ({ statusBody, statusUpdatedAt, ...pr }) => ({
      ...pr,
      status: statusBody ? parseStatus(statusBody, statusUpdatedAt) : null,
    }),
  );

const prs = fromFile ? readSaved(fromFile) : await readOpenPrs();
const body = buildInbox(prs, new Date().toISOString());
if (isDryRun) {
  console.log(body);
} else {
  await writeInbox(body);
}
