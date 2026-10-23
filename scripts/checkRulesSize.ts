import { readFileSync } from 'node:fs';

// Firestore refuses to release rules whose compiled executables pass 256,000 bytes ("Total size of compiled executables must be smaller than 256000 bytes"), and the compiler copies a function's body into every rule that calls it. This estimates that size from the source and fails well before the limit, since the limit is only seen when the merge deploy tries to release.
const LIMIT_BYTES = 256_000;
const FAIL_BYTES = 248_000;
const WARN_BYTES = 238_000;
// Fitted to one real answer: the rules of #395 (297,598 expanded characters here) compiled to 258,960 bytes.
const BYTES_PER_CHAR = 0.87;

const source = readFileSync('firestore.rules', 'utf8')
  .replace(/\/\/[^\n]*/g, '')
  .replace(/\s+/g, ' ');

const bodies = new Map<string, string>();
for (const match of source.matchAll(/function (\w+)\([^)]*\) \{/g)) {
  const start = (match.index ?? 0) + match[0].length;
  const end = [...source.slice(start)].reduce(
    (state, char, offset) =>
      state.depth === 0
        ? state
        : {
            depth: state.depth + (char === '{' ? 1 : char === '}' ? -1 : 0),
            end: start + offset,
          },
    { depth: 1, end: start },
  ).end;
  const body = source.slice(start, end);
  const known = bodies.get(match[1]) ?? '';
  if (body.length > known.length) bodies.set(match[1], body);
}

const cache = new Map<string, number>();
const expand = (text: string, depth: number): number =>
  [...text.matchAll(/\b(\w+)\(/g)].reduce((total, call) => {
    const body = bodies.get(call[1]);
    return body === undefined || depth > 12
      ? total
      : total + expandedFunction(call[1], depth + 1);
  }, text.length);
const expandedFunction = (name: string, depth: number): number => {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const result = expand(bodies.get(name) ?? '', depth);
  cache.set(name, result);
  return result;
};

const rules = [...source.matchAll(/allow ([\w, ]+): if ([^;]*);/g)].map(
  (match) => ({
    name: `${match[1]}: ${match[2].slice(0, 80)}`,
    size: expand(match[2], 0),
  }),
);
const estimate = Math.round(
  rules.reduce((total, rule) => total + rule.size, 0) * BYTES_PER_CHAR,
);

const biggest = (items: { name: string; size: number }[]) =>
  items
    .sort((a, b) => b.size - a.size)
    .slice(0, 6)
    .map((item) => `  ${Math.round(item.size * BYTES_PER_CHAR)}  ${item.name}`)
    .join('\n');
const hints = `Largest rules (bytes once functions are copied into them):\n${biggest(rules)}\nLargest functions:\n${biggest(
  [...bodies.keys()].map((name) => ({
    name,
    size: expandedFunction(name, 0),
  })),
)}\nWhat shrinks it: one \`allow create, update: if shape(...) && (request.method == 'create' || <update checks>)\` instead of two rules that each call the same shape function; fewer calls to a big function; a shorter function. Comments cost nothing.`;

const report = `Estimated compiled size of firestore.rules: ${estimate} bytes (limit ${LIMIT_BYTES}, fails at ${FAIL_BYTES}).`;
if (estimate >= FAIL_BYTES) {
  console.error(`${report}\n${hints}`);
  process.exit(1);
}
console.log(
  estimate >= WARN_BYTES ? `${report} Getting close.\n${hints}` : report,
);
