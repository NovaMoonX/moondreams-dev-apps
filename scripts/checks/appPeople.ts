import { existsSync, readFileSync } from 'node:fs';

// Apps join as they're touched.
const REQUIRED = ['runway'];

const MIN_PEOPLE = 2;

const peopleIn = (doc: string) => {
  const section = doc.split(/^## Who It Is For\s*$/m)[1];
  if (section === undefined) return null;
  const body = section.split(/^## /m)[0];
  return (body.match(/^### .+$/gm) ?? []).length;
};

const failures = REQUIRED.flatMap((id) => {
  const path = `src/apps/${id}/PRODUCT.md`;
  if (!existsSync(path)) return [`${path}: missing`];
  const count = peopleIn(readFileSync(path, 'utf8'));
  if (count === null) return [`${path}: no "## Who It Is For" heading`];
  return count < MIN_PEOPLE
    ? [
        `${path}: "Who It Is For" names ${count} people (needs ${MIN_PEOPLE}+, one "###" each)`,
      ]
    : [];
});

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`app people: ${REQUIRED.join(', ')} ok`);
