import { readFileSync } from 'node:fs';

// Firestore refuses to release rules whose compiled executables pass 256,000 bytes, a limit neither the emulator nor the CLI's compile check applies, so it only shows when the merge deploy releases the rules.
const LIMIT_BYTES = 256_000;
const FAIL_BYTES = 250_000;
const WARN_BYTES = 240_000;
// Two real answers from the Rules API fit this to five digits: 149,020 characters compiled to 258,960 bytes and 148,773 to 258,529. Calls are not expanded, so only the text counts.
const BYTES_PER_CHAR = 1.73775;

const source = readFileSync('firestore.rules', 'utf8')
  .replace(/\/\/[^\n]*/g, '')
  .replace(/\s+/g, ' ');
const estimate = Math.round(source.length * BYTES_PER_CHAR);

const repeats = [
  ...source
    .split(/ && | \|\| |; |\{ |\} /)
    .map((part) => part.trim())
    .filter((part) => part.length >= 45)
    .reduce(
      (counts, part) => counts.set(part, (counts.get(part) ?? 0) + 1),
      new Map<string, number>(),
    ),
]
  .filter(([, count]) => count > 1)
  .map(([part, count]) => ({ part, saved: (count - 1) * part.length, count }))
  .sort((a, b) => b.saved - a.saved)
  .slice(0, 6)
  .map(
    ({ part, saved, count }) =>
      `  ${Math.round(saved * BYTES_PER_CHAR)} bytes, ${count} times: ${part.slice(0, 90)}`,
  )
  .join('\n');

const report = `Estimated compiled size of firestore.rules: ${estimate} bytes (limit ${LIMIT_BYTES}, fails at ${FAIL_BYTES}).`;
const hints = `Comments and extra spaces cost nothing; every character of code does, and a function body counts once however often it is called. What shrinks it: a helper function for a clause that repeats, removing dead code, shorter checks. Clauses repeated most:\n${repeats}`;
if (estimate >= FAIL_BYTES) {
  console.error(`${report}\n${hints}`);
  process.exit(1);
}
console.log(
  estimate >= WARN_BYTES ? `${report} Getting close.\n${hints}` : report,
);
