import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const USAGE = `Checks a PR body's Screenshots section: every table cell there shows an image that loads.

  npm run check:pr-screenshots -- 1298            reads the PR's body with gh
  npm run check:pr-screenshots -- --body-file body.md
  PR_BODY="..." npm run check:pr-screenshots      (the workflow's form)`;

const IMAGE_MARKDOWN =
  /!\[[^\]]*\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const IMAGE_TAG = /<img\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["'][^>]*>/gi;

function readBody(argv: string[]): string {
  const fileAt = argv.indexOf('--body-file');
  if (fileAt !== -1) return readFileSync(argv[fileAt + 1] ?? '', 'utf8');
  if (process.env.PR_BODY !== undefined) return process.env.PR_BODY;
  const pr = argv.find((arg) => /^\d+$/.test(arg));
  if (pr === undefined) {
    console.error(USAGE);
    process.exit(2);
  }
  return execFileSync(
    'gh',
    ['api', `repos/NovaMoonX/moondreams-dev-apps/pulls/${pr}`, '--jq', '.body'],
    { encoding: 'utf8' },
  );
}

function readSection(body: string): string[] | null {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => /^##\s+Screenshots\b/i.test(line));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(
    (line) => /^#{1,2}\s/.test(line) || /^<details/i.test(line.trim()),
  );
  return end === -1 ? rest : rest.slice(0, end);
}

const imageUrls = (text: string) => [
  ...Array.from(text.matchAll(IMAGE_MARKDOWN), (match) => match[1]),
  ...Array.from(text.matchAll(IMAGE_TAG), (match) => match[1]),
];

const isTableRule = (line: string) =>
  /^\|?[\s:|-]+\|?$/.test(line.trim()) && line.includes('-');

function findProblems(section: string[]): string[] {
  const isRow = (line: string | undefined) =>
    line !== undefined && line.trim().startsWith('|');
  const bodyRows = section.filter(
    (line, index) =>
      isRow(line) &&
      !isTableRule(line) &&
      !(isRow(section[index + 1]) && isTableRule(section[index + 1] ?? '')),
  );
  const markdownRows = bodyRows.map((row) =>
    row
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim()),
  );
  const htmlRows = Array.from(
    section.join('\n').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi),
    (row) => Array.from(row[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)),
  )
    .filter((cells) => cells.some((cell) => cell[1].toLowerCase() === 'td'))
    .map((cells) => cells.map((cell) => cell[2].trim()));
  const cellProblems = [...markdownRows, ...htmlRows].flatMap((cells) => {
    const isLabelled = cells
      .slice(1)
      .some((cell) => imageUrls(cell).length > 0);
    return cells.flatMap((cell, column) => {
      if (imageUrls(cell).length > 0) return [];
      if (column === 0 && isLabelled && cell !== '') return [];
      return [
        `A screenshot cell (column ${column + 1}) shows no image: "${cell || '(empty)'}"`,
      ];
    });
  });
  const linkProblems = Array.from(
    section
      .join('\n')
      .replace(IMAGE_MARKDOWN, '')
      .matchAll(/(?<!!)\[[^\]]*\]\([^)]*\.(?:png|jpe?g|webp|gif)[^)]*\)/gi),
    (match) =>
      `An image is written as a link, not an image (missing "!"): "${match[0].slice(0, 160)}"`,
  );
  const empty =
    imageUrls(section.join('\n')).length === 0
      ? ['The Screenshots section has no images.']
      : [];
  return [...empty, ...cellProblems, ...linkProblems];
}

// GitHub answers 503 now and then when many images are fetched at once.
async function fetchWithRetry(url: string, triesLeft = 2): Promise<Response> {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status < 500 || triesLeft <= 1) return response;
  await response.body?.cancel();
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  return fetchWithRetry(url, triesLeft - 1);
}

async function findDeadImages(urls: string[]): Promise<string[]> {
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetchWithRetry(url);
        await response.body?.cancel();
        const type = response.headers.get('content-type') ?? '';
        if (!response.ok)
          return `An image does not load (${response.status}): ${url}`;
        return type.startsWith('image/')
          ? null
          : `An image link is not an image (${type}): ${url}`;
      } catch (error) {
        return `An image could not be fetched (${error instanceof Error ? error.message : 'unknown'}): ${url}`;
      }
    }),
  );
  return results.filter((problem) => problem !== null);
}

const section = readSection(readBody(process.argv.slice(2)));
if (section === null) {
  console.log('No Screenshots section: nothing to check.');
  process.exit(0);
}
const urls = Array.from(new Set(imageUrls(section.join('\n'))));
const problems = [...findProblems(section), ...(await findDeadImages(urls))];
if (problems.length > 0) {
  problems.forEach((problem) => console.log(`::error::${problem}`));
  process.exit(1);
}
console.log(
  `Screenshots: ${urls.length} image${urls.length === 1 ? '' : 's'}, every one filled in and loading.`,
);
