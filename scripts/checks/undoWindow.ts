import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

const MIN_MS = 10_000;
const ROOT = 'src';

const listSources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listSources(path);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });

const propertyOf = (node: ts.ObjectLiteralExpression, name: string) =>
  node.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
      property.name.text === name,
  );

const isUndoLabel = (
  node: ts.ObjectLiteralExpression,
  source: ts.SourceFile,
) => {
  const label = propertyOf(node, 'label');
  return label !== undefined && /undo/i.test(label.initializer.getText(source));
};

const isLongEnough = (
  node: ts.ObjectLiteralExpression,
  source: ts.SourceFile,
) => {
  const duration = propertyOf(node, 'duration')?.initializer;
  if (duration === undefined) {
    return false;
  }
  if (ts.isNumericLiteral(duration)) {
    return Number(duration.text.replace(/_/g, '')) >= MIN_MS;
  }
  return duration.getText(source) === 'UNDO_WINDOW_MS';
};

interface Findings {
  checked: number;
  failures: string[];
}

const inspect = (path: string): Findings => {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const where = (node: ts.Node) =>
    `${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
  const findings: Findings = { checked: 0, failures: [] };
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const action = propertyOf(node, 'action')?.initializer;
      if (
        action !== undefined &&
        ts.isObjectLiteralExpression(action) &&
        isUndoLabel(action, source)
      ) {
        findings.checked += 1;
        if (!isLongEnough(node, source)) {
          findings.failures.push(
            `${where(node)}: an Undo toast needs duration: UNDO_WINDOW_MS`,
          );
        }
      }
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === 'useUndoRemoval' &&
      node.arguments.length > 0
    ) {
      findings.failures.push(
        `${where(node)}: useUndoRemoval takes no argument, the window is shared`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
};

const windowMatch = /UNDO_WINDOW_MS\s*=\s*([\d_]+)/.exec(
  readFileSync('src/lib/undo/index.ts', 'utf8'),
);
const windowFailures =
  windowMatch !== null && Number(windowMatch[1].replace(/_/g, '')) >= MIN_MS
    ? []
    : [`src/lib/undo/index.ts: UNDO_WINDOW_MS must be at least ${MIN_MS}`];

const all = listSources(ROOT).map(inspect);
const failures = [...windowFailures, ...all.flatMap((f) => f.failures)];
const checked = all.reduce((sum, f) => sum + f.checked, 0);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(
  `undo-window: ${checked} Undo toasts last at least ${MIN_MS / 1000}s`,
);
