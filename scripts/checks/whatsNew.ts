import { execFileSync } from 'node:child_process';

import { readWhatsNewFiles, WHATS_NEW_DIR } from '../lib/whatsNewFiles.ts';

const { errors, files } = readWhatsNewFiles();
const problems = [...errors];

const argv = process.argv.slice(2);
const prIndex = argv.indexOf('--pr');
const baseRef = prIndex >= 0 ? argv[prIndex + 1] : null;

if (prIndex >= 0 && !baseRef) {
  problems.push('--pr needs a base ref, for example --pr origin/main');
}

if (baseRef) {
  const changed = execFileSync(
    'git',
    ['diff', '--name-only', `${baseRef}...HEAD`],
    {
      encoding: 'utf8',
    },
  )
    .split('\n')
    .filter(Boolean);
  const isVisible = (file: string) =>
    /^(src\/(apps|ui|screens|components)\/|src\/index\.css$)/.test(file) &&
    !/\.md$/.test(file) &&
    !/(^|\/)__tests__\//.test(file) &&
    !/\.test\.tsx?$/.test(file);
  const visible = changed.filter(isVisible);
  const hasNote = changed.some((file) =>
    new RegExp(`^${WHATS_NEW_DIR}/[^/]+\\.json$`).test(file),
  );
  const hasNone = /^What's new: none\b/im.test(process.env.PR_BODY ?? '');
  if (visible.length > 0 && !hasNote && !hasNone) {
    problems.push(
      [
        `This PR changes what people see (${visible.slice(0, 3).join(', ')}${visible.length > 3 ? ', ...' : ''}) but has no What's new note.`,
        `Add ${WHATS_NEW_DIR}/<slug>.json (see ${WHATS_NEW_DIR}/README.md), or, if nothing here is noticeable, add a line to the PR description: What's new: none (reason)`,
      ].join('\n'),
    );
  }
}

if (problems.length > 0) {
  console.error(problems.map((problem) => `- ${problem}`).join('\n'));
  process.exit(1);
}
console.log(
  `What's new: ${files.length} file(s) valid${baseRef ? `, PR rule met against ${baseRef}` : ''}.`,
);
