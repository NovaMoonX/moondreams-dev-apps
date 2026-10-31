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
  findFeedbackIds,
  findSessionLink,
  keepOwnerTicks,
  parseGallery,
  parseStatus,
  summarizeCi,
  type CheckRun,
  type CiState,
  type InboxPr,
  type MergedPr,
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

/** Every page of a list endpoint, 100 at a time. */
const apiAll = async <T>(path: string, page = 1): Promise<T[]> => {
  const join = path.includes('?') ? '&' : '?';
  const items = await api<T[]>(`${path}${join}per_page=100&page=${page}`);
  return items.length < 100
    ? items
    : [...items, ...(await apiAll<T>(path, page + 1))];
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
  merged_at?: string | null;
}
interface ApiComment {
  id: number;
  body: string;
  updated_at: string;
  author_association: string;
}
interface ApiClosedPull extends ApiPull {
  merged_at: string | null;
}
interface ApiCheckRuns {
  check_runs: CheckRun[];
}
interface ApiIssue {
  number: number;
  state: string;
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
  const comments = await apiAll<ApiComment>(
    `/repos/${repo}/issues/${pull.number}/comments`,
  );
  const status = comments.findLast(
    (comment) =>
      comment.body.trimStart().startsWith(STATUS_MARKER) &&
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
    gallery: parseGallery(pull.body),
    feedbackIds: findFeedbackIds(pull.body),
  };
};

const readOpenPrs = async (): Promise<InboxPr[]> => {
  const pulls = await apiAll<ApiPull>(`/repos/${repo}/pulls?state=open`);
  const own = pulls.filter((pull) => pull.head.repo?.full_name === repo);
  // One PR at a time keeps clear of GitHub's secondary rate limits.
  return own.reduce<Promise<InboxPr[]>>(
    async (done, pull) => [...(await done), await readPr(pull)],
    Promise.resolve([]),
  );
};

const writeInbox = async (body: string) => {
  const issues = await apiAll<ApiIssue>(
    `/repos/${repo}/issues?state=all&labels=${INBOX_LABEL}`,
  );
  const found = issues.find(
    (issue) => !issue.pull_request && issue.body?.includes(INBOX_MARKER),
  );
  if (found) {
    if (found.body === body && found.state === 'open')
      return console.log(`#${found.number} is already current`);
    await api(`/repos/${repo}/issues/${found.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ body, state: 'open' }),
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
  const pinned = await api<{ errors?: { message: string }[] }>('/graphql', {
    method: 'POST',
    body: JSON.stringify({
      query:
        'mutation($id: ID!) { pinIssue(input: { issueId: $id }) { issue { number } } }',
      variables: { id: created.node_id },
    }),
  }).catch((error: Error) => ({ errors: [{ message: error.message }] }));
  if (pinned.errors?.length) {
    console.log(
      `::warning::Couldn't pin #${created.number}, pin it by hand: ${pinned.errors[0].message}`,
    );
  }
  console.log(`Created #${created.number}`);
};

type SavedPr = Omit<InboxPr, 'status' | 'gallery' | 'feedbackIds'> & {
  body?: string | null;
  statusBody: string | null;
  statusUpdatedAt: string;
};

const readSaved = (path: string): InboxPr[] =>
  (JSON.parse(readFileSync(path, 'utf8')) as SavedPr[]).map(
    ({ body, statusBody, statusUpdatedAt, ...pr }) => ({
      ...pr,
      gallery: parseGallery(body ?? null),
      feedbackIds: findFeedbackIds(body ?? null),
      status: statusBody ? parseStatus(statusBody, statusUpdatedAt) : null,
    }),
  );

const MERGED_KEEP_MS = 14 * 24 * 60 * 60 * 1000;

const readMergedPrs = async (): Promise<MergedPr[]> => {
  const pulls = await api<ApiPull[]>(
    `/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50`,
  );
  const since = Date.now() - MERGED_KEEP_MS;
  return pulls.flatMap((pull) =>
    pull.merged_at && Date.parse(pull.merged_at) >= since
      ? [
          {
            number: pull.number,
            sessionUrl: findSessionLink(pull.body),
            mergedAt: pull.merged_at,
          },
        ]
      : [],
  );
};

interface CommentEvent {
  action?: string;
  comment?: ApiComment & { author_association: string };
  changes?: { body?: { from?: string } };
}

// A session rewriting its status comment can drop the owner's ticks; the edit's previous body says which they were.
const restoreOwnerTicks = async () => {
  const path = process.env.GITHUB_EVENT_PATH;
  if (process.env.GITHUB_EVENT_NAME !== 'issue_comment' || !path) return;
  const event = JSON.parse(readFileSync(path, 'utf8')) as CommentEvent;
  const before = event.changes?.body?.from;
  const comment = event.comment;
  if (event.action !== 'edited' || !before || !comment) return;
  if (!TRUSTED.has(comment.author_association)) return;
  if (!comment.body.trimStart().startsWith(STATUS_MARKER)) return;
  // The run can start minutes after its event, so it works on the comment as it is now, never the event's copy.
  const live = await api<ApiComment>(`/repos/${repo}/issues/comments/${comment.id}`);
  const kept = keepOwnerTicks(before, live.body);
  if (kept === live.body) return;
  await api(`/repos/${repo}/issues/comments/${comment.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ body: kept }),
  });
  console.log(`Ticked the owner's boxes again on comment ${comment.id}`);
};

if (!isDryRun) {
  await restoreOwnerTicks().catch((error: Error) =>
    console.log(`::warning::Couldn't keep the owner's ticks: ${error.message}`),
  );
}
const prs = fromFile ? readSaved(fromFile) : await readOpenPrs();
const body = buildInbox(prs, new Date().toISOString());
const pipelineKey = process.env.PIPELINE_KEY ?? '';
const pipelineUrl =
  process.env.PIPELINE_URL ??
  'https://us-central1-moondreams-dev-apps.cloudfunctions.net/recordPipelineEvent';

/** Undoes `toPlain`'s escaping, which the issue needs and the dashboard (React escapes for itself) doesn't. */
const fromPlain = (text: string) =>
  text
    .replace(/@\u200b/g, '@')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const toPipelinePr = (pr: InboxPr): InboxPr => ({
  ...pr,
  title: fromPlain(pr.title),
  status: pr.status && {
    ...pr.status,
    sessionTitle: pr.status.sessionTitle && fromPlain(pr.status.sessionTitle),
    state: pr.status.state && fromPlain(pr.status.state),
    ownerItems: pr.status.ownerItems.map((item) => ({
      text: fromPlain(item.text),
      options: item.options.map((option) => ({
        ...option,
        label: fromPlain(option.label),
      })),
      isMulti: item.isMulti,
      isTask: item.isTask,
      settled: item.settled,
    })),
    mustDo: pr.status.mustDo && pr.status.mustDo.map(fromPlain),
    goodToKnow: pr.status.goodToKnow.map(fromPlain),
  },
  gallery: pr.gallery.map((step) => ({
    ...step,
    label: fromPlain(step.label),
    note: step.note && fromPlain(step.note),
  })),
});

const reportToPipeline = async (list: InboxPr[], merged: MergedPr[]) => {
  const response = await fetch(pipelineUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        key: pipelineKey,
        kind: 'inbox',
        prs: list.map(toPipelinePr),
        merged,
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`status ${response.status}`);
};

/** Open PRs say whether they wait on the owner; recently merged ones say they merged. Only PRs that link feedback are sent. */
const readFeedbackReports = async (open: InboxPr[]) => {
  const merged = (
    await api<ApiClosedPull[]>(
      `/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30`,
    )
  ).filter(
    (pull) => pull.merged_at !== null && pull.head.repo?.full_name === repo,
  );
  return [
    ...open.map((pr) => ({
      url: pr.url,
      feedbackIds: pr.feedbackIds,
      needsOwner: (pr.status?.ownerItems.length ?? 0) > 0,
      isMerged: false,
    })),
    ...merged.map((pull) => ({
      url: pull.html_url,
      feedbackIds: findFeedbackIds(pull.body),
      needsOwner: false,
      isMerged: true,
    })),
  ].filter((pr) => pr.feedbackIds.length > 0);
};

const reportFeedbackToPipeline = async (list: InboxPr[]) => {
  const reports = await readFeedbackReports(list);
  if (reports.length === 0) return;
  const response = await fetch(pipelineUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: { key: pipelineKey, kind: 'feedback', prs: reports },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`status ${response.status}`);
};

if (isDryRun) {
  console.log(body);
} else {
  await writeInbox(body);
  if (pipelineKey) {
    const merged = await readMergedPrs().catch((error: Error) => {
      console.log(`::warning::Merged PRs not read: ${error.message}`);
      return [];
    });
    await reportToPipeline(prs, merged).catch((error: Error) =>
      console.log(`::warning::Pipeline view not updated: ${error.message}`),
    );
    await reportFeedbackToPipeline(prs).catch((error: Error) =>
      console.log(`::warning::Feedback not updated: ${error.message}`),
    );
  }
}
