import { readFileSync } from 'node:fs';

// `{name=**}` also matches the document the wildcard hangs from, where `name` is empty: `name[0]` errors there
// and refuses the operation, so every operation a rule indexes the wildcard for needs its own allow on the parent.
const OPS_COVERED: Record<string, string[]> = {
  read: ['get', 'list'],
  get: ['get'],
  list: ['list'],
  write: ['create', 'update', 'delete'],
  create: ['create'],
  update: ['update'],
  delete: ['delete'],
};

type Block = { path: string; body: string };

const readBlocks = (source: string): Block[] =>
  [...source.matchAll(/match\s+(\S+)\s*\{/g)].map((found) => {
    const start = (found.index ?? 0) + found[0].length;
    const end = [...source.slice(start)].reduce<{ depth: number; at: number }>(
      (state, char, index) => {
        if (state.at >= 0) return state;
        const depth = state.depth + (char === '{' ? 1 : char === '}' ? -1 : 0);
        return { depth, at: depth < 0 ? start + index : -1 };
      },
      { depth: 0, at: -1 },
    ).at;
    return { path: found[1], body: source.slice(start, end) };
  });

const readAllows = (body: string) =>
  [...body.matchAll(/allow\s+([a-z,\s]+):\s*if([^;]*);/g)].map((found) => ({
    ops: found[1]
      .split(',')
      .map((op) => op.trim())
      .flatMap((op) => OPS_COVERED[op] ?? []),
    condition: found[2],
  }));

const source = readFileSync('firestore.rules', 'utf8').replace(
  /\/\/[^\n]*/g,
  '',
);
const blocks = readBlocks(source);

const problems = blocks.flatMap(({ path, body }) => {
  const wildcard = path.match(/^(.*)\/\{(\w+)=\*\*\}$/);
  if (!wildcard) return [];
  const [, parent, name] = wildcard;
  const indexed = readAllows(body)
    .filter(({ condition }) => new RegExp(`\\b${name}\\[`).test(condition))
    .flatMap(({ ops }) => ops);
  const parentOps = new Set(
    blocks
      .filter((block) => block.path === parent)
      .flatMap((block) => readAllows(block.body).flatMap(({ ops }) => ops)),
  );
  return [...new Set(indexed)]
    .filter((op) => !parentOps.has(op))
    .map(
      (op) =>
        `${path}: indexes ${name}[...] for ${op}, but ${parent} has no allow for ${op} of its own, so that ${op} of the parent document is refused`,
    );
});

if (problems.length > 0) {
  problems.forEach((problem) => console.error(problem));
  process.exit(1);
}
console.log(
  `Recursive wildcards checked: ${blocks.filter((block) => /=\*\*\}$/.test(block.path)).length}`,
);
