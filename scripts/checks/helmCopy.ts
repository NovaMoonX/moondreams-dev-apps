import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Screen copy never names the assistant or the app literally: the assistant's name is chosen by the person.
const ROOT = 'src/apps/helm/components';
const COPY_FILE = 'src/apps/helm/constants.ts';
const DEFAULT_NAME = 'Nomos';
// An identifier that contains the name (`howNomosSeesYou`) is code, not copy.
const NAME_AS_WORD = new RegExp(`(?<![A-Za-z])${DEFAULT_NAME}(?![a-z])`);
const QUOTED_APP_NAME = /['"`>][^'"`<]*\bHelm\b/;

// Line-based: a comment or a console line is ignored, and a template literal's continuation line is checked only when it is quoted.
const withoutComment = (line: string) =>
  /^\s*(\*|\/\*|console\.)/.test(line) ? '' : line.replace(/\s\/\/.*$/, '');

const listFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });

const readLines = (path: string) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .map((line, index) => ({ path, line, number: index + 1 }));

const copyLines = () => {
  const lines = readLines(COPY_FILE);
  const start = lines.findIndex(({ line }) => line.includes('HELM_COPY = {'));
  const end = lines.findIndex(
    ({ line }, index) => index > start && line.startsWith('}'),
  );
  return start === -1 ? [] : lines.slice(start + 1, end);
};

const problems = [
  ...listFiles(ROOT)
    .filter((path) => /\.(ts|tsx)$/.test(path))
    .flatMap(readLines),
  ...copyLines(),
].flatMap(({ path, line: rawLine, number }) => {
  const line = withoutComment(rawLine);
  if (NAME_AS_WORD.test(line))
    return [
      `${path}:${number} names "${DEFAULT_NAME}"; use useAssistantName() and a template in constants.ts`,
    ];
  if (QUOTED_APP_NAME.test(line))
    return [
      `${path}:${number} names "Helm" in copy; the person talks to their assistant, so name it with useAssistantName()`,
    ];
  return [];
});

if (problems.length > 0) {
  problems.forEach((problem) => console.error(problem));
  process.exit(1);
}
console.log(
  'check:helm-copy: no literal assistant or app name in Helm screen copy.',
);
