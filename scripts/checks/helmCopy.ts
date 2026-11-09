import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Every line that names the assistant is a template filled with its name, so a renamed assistant is renamed everywhere.
const ROOT = 'src/apps/helm/components';
const DEFAULT_NAME = 'Nomos';

const listFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });

const problems = listFiles(ROOT)
  .filter((path) => /\.(ts|tsx)$/.test(path))
  .flatMap((path) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .flatMap((line, index) =>
        line.includes(DEFAULT_NAME)
          ? [
              `${path}:${index + 1} names "${DEFAULT_NAME}"; use useAssistantName() and a template in constants.ts`,
            ]
          : [],
      ),
  );

if (problems.length > 0) {
  problems.forEach((problem) => console.error(problem));
  process.exit(1);
}
console.log(
  'check:helm-copy: no literal assistant name under src/apps/helm/components.',
);
