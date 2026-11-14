import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

import type { ConnectorManifest } from '../../src/lib/connections/contract.ts';
import { GOOGLE_CALENDAR_MANIFEST } from '../../src/lib/connections/google/calendarManifest.ts';
import { GOOGLE_CONTACTS_MANIFEST } from '../../src/lib/connections/google/contactsManifest.ts';
import { GOOGLE_DRIVE_MANIFEST } from '../../src/lib/connections/google/driveManifest.ts';
import { GOOGLE_GMAIL_MANIFEST } from '../../src/lib/connections/google/gmailManifest.ts';
import { SOURCE_SHARES } from '../../src/lib/connections/sources.ts';
import type { ShareDecision } from '../../src/lib/connections/fieldDecisions.ts';

const ROOT = join(import.meta.dirname, '..', '..');

/** Names an adapter reads that no stored type holds, each with why: sealed payload keys opened with the app's key are not document fields. */
const ADAPTER_EXEMPT: Record<string, Record<string, string>> = {};

interface FieldsModule {
  SHARE_FIELDS: Record<string, Record<string, ShareDecision>>;
  NOT_STORED: Record<string, string>;
}

const problems: string[] = [];
const report = (file: string, line: number, message: string) =>
  problems.push(`${relative(ROOT, file)}:${line} — ${message}`);

const parse = (file: string) =>
  ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

const lineOf = (sf: ts.SourceFile, node: ts.Node) =>
  sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

const isExported = (node: ts.Statement) =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );

/** Exported interfaces and object-shaped type aliases, each with the line it starts on. */
const readStoredShapes = (sf: ts.SourceFile) =>
  sf.statements.flatMap((statement) => {
    if (!isExported(statement)) return [];
    if (ts.isInterfaceDeclaration(statement))
      return [{ name: statement.name.text, line: lineOf(sf, statement) }];
    if (
      ts.isTypeAliasDeclaration(statement) &&
      ts.isTypeLiteralNode(statement.type)
    )
      return [{ name: statement.name.text, line: lineOf(sf, statement) }];
    return [];
  });

const topName = (path: string) => path.split('.')[0];

const readLiteral = (node: ts.Node | undefined): string | null => {
  if (node === undefined) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text;
  return null;
};

const readStringArray = (node: ts.Node): string[] =>
  ts.isArrayLiteralExpression(node)
    ? node.elements.flatMap((element) => readLiteral(element) ?? [])
    : [];

interface Read {
  name: string;
  line: number;
  file: string;
}

/** The field names an adapter file reads from a document: `.get('a.b')`, `.select(...)`, `.where('x'`, `.orderBy('x'` and a `fieldMask`. */
const readAdapterFields = (file: string): Read[] => {
  const sf = parse(file);
  const constants = new Map(
    sf.statements.flatMap((statement) =>
      ts.isVariableStatement(statement)
        ? statement.declarationList.declarations.flatMap((declaration) =>
            ts.isIdentifier(declaration.name) && declaration.initializer
              ? [
                  [
                    declaration.name.text,
                    readStringArray(declaration.initializer),
                  ] as const,
                ]
              : [],
          )
        : [],
    ),
  );
  const reads: Read[] = [];
  const add = (node: ts.Node, value: string | null) => {
    const name = value === null ? '' : topName(value);
    if (name !== '') reads.push({ name, line: lineOf(sf, node), file });
  };
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const method = node.expression.name.text;
      const [first] = node.arguments;
      if (method === 'get' || method === 'where' || method === 'orderBy')
        add(node, readLiteral(first));
      if (method === 'select')
        node.arguments.forEach((argument) => {
          const spread = ts.isSpreadElement(argument)
            ? argument.expression
            : argument;
          if (ts.isIdentifier(spread))
            (constants.get(spread.text) ?? []).forEach((value) =>
              add(argument, value),
            );
          else add(argument, readLiteral(spread));
        });
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(sf) === 'fieldMask')
      readStringArray(node.initializer).forEach((value) => add(node, value));
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return reads;
};

const readAdapterFiles = (appId: string) => {
  const dir = join(ROOT, 'functions/src/apps', appId, 'share');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && name !== 'manifest.ts')
    .map((name) => join(dir, name));
};

const checkApp = async (appId: string) => {
  const typesFile = join(ROOT, 'src/apps', appId, 'types.ts');
  const fieldsFile = join(ROOT, 'src/apps', appId, 'share/fields.ts');
  if (!existsSync(fieldsFile)) {
    report(
      fieldsFile,
      1,
      `${appId} shares with other apps but has no share/fields.ts: decide each stored field`,
    );
    return;
  }
  const { SHARE_FIELDS, NOT_STORED } = (await import(
    fieldsFile
  )) as FieldsModule;
  const shapes = readStoredShapes(parse(typesFile));
  const names = new Set(shapes.map((shape) => shape.name));
  shapes.forEach(({ name, line }) => {
    const decided = name in SHARE_FIELDS;
    const skipped = name in NOT_STORED;
    if (!decided && !skipped)
      report(
        typesFile,
        line,
        `${name} is in neither SHARE_FIELDS nor NOT_STORED: decide its fields`,
      );
    if (decided && skipped)
      report(typesFile, line, `${name} is in both SHARE_FIELDS and NOT_STORED`);
  });
  [...Object.keys(SHARE_FIELDS), ...Object.keys(NOT_STORED)]
    .filter((name) => !names.has(name))
    .forEach((name) =>
      report(
        fieldsFile,
        1,
        `${name} is listed but no longer exported from types.ts: remove it`,
      ),
    );
  const sent = new Set(
    Object.values(SHARE_FIELDS).flatMap((map) =>
      Object.entries(map)
        .filter(
          ([, decision]) => decision === 'shared' || decision === 'filter',
        )
        .map(([key]) => key),
    ),
  );
  const exempt = ADAPTER_EXEMPT[appId] ?? {};
  readAdapterFiles(appId)
    .flatMap(readAdapterFields)
    .filter(({ name }) => !sent.has(name) && !(name in exempt))
    .forEach(({ name, line, file }) =>
      report(
        file,
        line,
        `the adapter reads '${name}' but no map in share/fields.ts marks it shared or filter: decide it`,
      ),
    );
};

const appIds = SOURCE_SHARES.filter(
  ({ appId, shares }) =>
    shares.length > 0 &&
    existsSync(join(ROOT, 'functions/src/apps', appId, 'share/adapter.ts')),
).map(({ appId }) => appId);

for (const appId of appIds) await checkApp(appId);

/** Every category says what it reads, and its scopeVersion is the newest read's, so a new read always raises it and the reader shows it as new. */
const checkReads = (manifest: ConnectorManifest) =>
  manifest.categories.forEach((category) => {
    const where = `${manifest.id} ${category.id}`;
    if (category.reads.length === 0)
      problems.push(`${where} — reads is empty: say what the category reads`);
    const newest = Math.max(
      0,
      ...category.reads.map(({ sinceVersion }) => sinceVersion),
    );
    if (
      !Number.isInteger(category.scopeVersion) ||
      category.scopeVersion < 1 ||
      category.scopeVersion !== newest
    )
      problems.push(
        `${where} — scopeVersion is ${category.scopeVersion} but the newest read is since ${newest}: a new read raises scopeVersion to its sinceVersion`,
      );
  });

[
  ...SOURCE_SHARES.flatMap(({ shares }) => shares),
  GOOGLE_CALENDAR_MANIFEST,
  GOOGLE_CONTACTS_MANIFEST,
  GOOGLE_DRIVE_MANIFEST,
  GOOGLE_GMAIL_MANIFEST,
].forEach(checkReads);

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(
    "\nUpdate the app's share/fields.ts; when a field is shared, also send it in the adapter and add a read with a raised scopeVersion.",
  );
  process.exit(1);
}
console.log(
  `share fields checked for ${appIds.length} apps; every manifest's reads match its scopeVersion`,
);
