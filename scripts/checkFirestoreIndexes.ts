import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

interface IndexField {
  fieldPath: string;
}

interface IndexDefinition {
  collectionGroup: string;
  queryScope: 'COLLECTION' | 'COLLECTION_GROUP';
  fields: IndexField[];
}

interface Constraint {
  kind: 'equality' | 'range' | 'order';
  field: string;
}

interface QuerySite {
  location: string;
  collection: string | null;
  scope: IndexDefinition['queryScope'];
  constraints: Constraint[];
}

const SOURCE_ROOTS = ['src', 'functions/src'];
const EQUALITY_OPS = new Set(['==', 'in', 'array-contains', 'array-contains-any']);
const RANGE_OPS = new Set(['<', '<=', '>', '>=', '!=', 'not-in']);
const QUERY_METHODS = new Set(['where', 'orderBy']);
const PASSTHROUGH_METHODS = new Set(['limit', 'limitToLast', 'startAt', 'startAfter', 'endAt', 'endBefore', 'offset']);

const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === 'node_modules' ? [] : listSourceFiles(path);
    }
    return /\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });

const literalText = (node: ts.Node | undefined): string | null =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;

const fieldName = (node: ts.Node | undefined, source: ts.SourceFile): string =>
  literalText(node) ?? node?.getText(source) ?? '?';

const methodName = (call: ts.CallExpression): string | null =>
  ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : null;

const functionName = (call: ts.CallExpression): string | null =>
  ts.isIdentifier(call.expression) ? call.expression.text : null;

const toConstraint = (name: string, args: readonly ts.Expression[], source: ts.SourceFile): Constraint | null => {
  if (name === 'orderBy') return { kind: 'order', field: fieldName(args[0], source) };

  const op = literalText(args[1]);
  if (op && EQUALITY_OPS.has(op)) return { kind: 'equality', field: fieldName(args[0], source) };
  if (op && RANGE_OPS.has(op)) return { kind: 'range', field: fieldName(args[0], source) };
  return null;
};

const lastSegment = (node: ts.Expression | undefined): string | null => {
  if (!node) return null;
  if (ts.isTemplateExpression(node)) {
    const tail = node.templateSpans[node.templateSpans.length - 1].literal.text;
    return tail.startsWith('/') && tail.length > 1 && !tail.slice(1).includes('/') ? tail.slice(1) : null;
  }
  const text = literalText(node);
  return text ? text.split('/').filter(Boolean).pop() ?? null : null;
};

const resolveCollection = (root: ts.Expression | undefined): Pick<QuerySite, 'collection' | 'scope'> => {
  const unresolved = { collection: null, scope: 'COLLECTION' as const };
  if (!root || !ts.isCallExpression(root)) return unresolved;

  const name = methodName(root) ?? functionName(root);
  if (name === 'collectionGroup') {
    return { collection: lastSegment(root.arguments[0]), scope: 'COLLECTION_GROUP' };
  }
  if (name === 'collection') {
    const lastArg = root.arguments[root.arguments.length - 1];
    return { collection: lastSegment(lastArg), scope: 'COLLECTION' };
  }
  return unresolved;
};

const collectChain = (top: ts.CallExpression, source: ts.SourceFile): Pick<QuerySite, 'collection' | 'scope' | 'constraints'> => {
  const walk = (node: ts.Expression, constraints: Constraint[]): Pick<QuerySite, 'collection' | 'scope' | 'constraints'> => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = node.expression.name.text;
      if (QUERY_METHODS.has(name) || PASSTHROUGH_METHODS.has(name)) {
        const constraint = QUERY_METHODS.has(name) ? toConstraint(name, node.arguments, source) : null;
        return walk(node.expression.expression, constraint ? [constraint, ...constraints] : constraints);
      }
    }
    return { ...resolveCollection(node), constraints };
  };

  return walk(top, []);
};

const findQuerySites = (path: string): QuerySite[] => {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const sites: QuerySite[] = [];
  const locate = (node: ts.Node) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    return `${path}:${line + 1}`;
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const method = methodName(node);
      const parentIsChain =
        ts.isPropertyAccessExpression(node.parent) &&
        (QUERY_METHODS.has(node.parent.name.text) || PASSTHROUGH_METHODS.has(node.parent.name.text));

      if (method && QUERY_METHODS.has(method) && !parentIsChain) {
        sites.push({ location: locate(node), ...collectChain(node, source) });
      }

      if (functionName(node) === 'query') {
        const [root, ...rest] = node.arguments;
        const constraints = rest.flatMap((arg) => {
          if (!ts.isCallExpression(arg)) return [];
          const name = functionName(arg);
          const constraint = name && QUERY_METHODS.has(name) ? toConstraint(name, arg.arguments, source) : null;
          return constraint ? [constraint] : [];
        });
        if (constraints.length > 0) {
          sites.push({ location: locate(node), ...resolveCollection(root), constraints });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return sites;
};

const requiredIndexFields = (constraints: Constraint[]) => {
  const equality = [...new Set(constraints.filter((c) => c.kind === 'equality').map((c) => c.field))];
  const ordered = [...new Set(constraints.filter((c) => c.kind !== 'equality').map((c) => c.field))].filter(
    (field) => !equality.includes(field),
  );
  return { equality, ordered };
};

const needsCompositeIndex = ({ equality, ordered }: ReturnType<typeof requiredIndexFields>) =>
  ordered.length >= 2 || (ordered.length === 1 && equality.length >= 1);

const isCoveredBy = (site: QuerySite, index: IndexDefinition) => {
  const { equality, ordered } = requiredIndexFields(site.constraints);
  const fields = index.fields.map((field) => field.fieldPath).filter((field) => field !== '__name__');
  const indexEquality = fields.slice(0, equality.length);
  const indexOrdered = fields.slice(equality.length);

  const result =
    index.queryScope === site.scope &&
    (site.collection === null || index.collectionGroup === site.collection) &&
    indexEquality.length === equality.length &&
    equality.every((field) => indexEquality.includes(field)) &&
    indexOrdered.length === ordered.length &&
    ordered.every((field, position) => indexOrdered[position] === field);

  return result;
};

const describe = (site: QuerySite) => {
  const { equality, ordered } = requiredIndexFields(site.constraints);
  return `${site.collection ?? '<unresolved collection>'} (${site.scope}) on ${[...equality, ...ordered].join(', ')}`;
};

const indexFile = JSON.parse(readFileSync('firestore.indexes.json', 'utf8')) as { indexes: IndexDefinition[] };
const sites = SOURCE_ROOTS.flatMap(listSourceFiles).flatMap(findQuerySites);
const needing = sites.filter((site) => needsCompositeIndex(requiredIndexFields(site.constraints)));
const missing = needing.filter((site) => !indexFile.indexes.some((index) => isCoveredBy(site, index)));
const unused = indexFile.indexes.filter((index) => !needing.some((site) => isCoveredBy(site, index)));

unused.forEach((index) => {
  const fields = index.fields.map((field) => field.fieldPath).join(', ');
  console.warn(`warning: index on ${index.collectionGroup} (${fields}) matches no query this script can see; remove it if the query is gone.`);
});

if (missing.length > 0) {
  console.error('Queries that need a composite index missing from firestore.indexes.json:\n');
  missing.forEach((site) => console.error(`  ${site.location}: ${describe(site)}`));
  console.error(
    '\nAdd the index (equality fields first, then the range/orderBy fields in query order) and deploy it with `npm run fb:indexes`.',
  );
  process.exit(1);
}

console.log(`Checked ${sites.length} queries; ${needing.length} need a composite index and all are in firestore.indexes.json.`);
