import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { getIconData, iconToSVG } from '@iconify/utils';
import type { IconifyInfo, IconifyJSON } from '@iconify/types';
import { Resvg } from '@resvg/resvg-js';

const API = 'https://api.iconify.design';

const USAGE = `Fetch an icon from the Iconify API, check its set's licence, and write it cleaned.

  npm run icon:get -- --search "google calendar"      list matches with their licences
  npm run icon:get -- logos:google-calendar           print it as a component
  npm run icon:get -- logos:google-calendar --name GoogleCalendarMark --into src/components/BrandMarks.tsx
  npm run icon:get -- lucide:sparkles --svg public/icons/sparkles.svg --no-trim

  --name <Component>  component name (default: from the icon name)
  --into <file.tsx>   replace or append that exported component; NOTICE in <file>.NOTICE.md
  --svg <file.svg>    write a standalone SVG; NOTICE in that folder's NOTICE.md
  --no-trim           keep the set's own padded grid (UI icons) instead of fitting the artwork
  --size <class>      default className (size-5)`;

// Licences that allow copying the artwork into this repo with a NOTICE line; anything else
// (share-alike, non-commercial, GPL, unknown) is refused so it is a deliberate decision.
const ALLOWED_LICENCES = new Set([
  'CC0-1.0',
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-3.0',
  'CC-BY-4.0',
]);

interface Args {
  icon: string | null;
  search: string | null;
  name: string | null;
  into: string | null;
  svg: string | null;
  trim: boolean;
  size: string;
}

function readArgs(argv: string[]): Args {
  const valueOf = (flag: string) => {
    const at = argv.indexOf(flag);
    return at === -1 ? null : (argv[at + 1] ?? null);
  };
  const flagsWithValues = ['--name', '--into', '--svg', '--size', '--search'];
  const positional = argv.filter(
    (arg, i) =>
      !arg.startsWith('--') && !flagsWithValues.includes(argv[i - 1] ?? ''),
  );
  return {
    icon: positional[0] ?? null,
    search: valueOf('--search'),
    name: valueOf('--name'),
    into: valueOf('--into'),
    svg: valueOf('--svg'),
    trim: !argv.includes('--no-trim'),
    size: valueOf('--size') ?? 'size-5',
  };
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return (await response.json()) as T;
}

async function readCollection(prefix: string): Promise<IconifyInfo> {
  const collections = await getJson<Record<string, IconifyInfo>>(
    `${API}/collections?prefixes=${encodeURIComponent(prefix)}`,
  );
  const info = collections[prefix];
  if (!info) throw new Error(`No icon set "${prefix}" on the Iconify API.`);
  return info;
}

async function search(query: string) {
  const result = await getJson<{ icons: string[] }>(
    `${API}/search?query=${encodeURIComponent(query)}&limit=64`,
  );
  const prefixes = Array.from(
    new Set(result.icons.map((icon) => icon.split(':')[0])),
  );
  const infos = await getJson<Record<string, IconifyInfo>>(
    `${API}/collections?prefixes=${prefixes.join(',')}`,
  );
  result.icons.forEach((icon) => {
    const info = infos[icon.split(':')[0]];
    const spdx = info?.license?.spdx ?? 'unknown';
    const mark = ALLOWED_LICENCES.has(spdx) ? ' ' : '✗';
    const colour = info?.palette ? 'colour' : 'mono';
    console.log(
      `${mark} ${icon.padEnd(48)} ${spdx.padEnd(12)} ${colour.padEnd(6)} ${info?.name ?? ''}`,
    );
  });
  console.log(
    `\nPreview: https://icon-sets.iconify.design/ · ✗ = licence not allowed by icon:get`,
  );
}

const round = (value: number) => Math.round(value * 1000) / 1000;

function cleanBody(body: string) {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(title|desc|metadata)\b[\s\S]*?<\/\1>/g, '')
    .replace(/\s(data-[\w-]+|xml:space|version|xmlns(:\w+)?)="[^"]*"/g, '')
    .trim();
}

function squareViewBox(body: string, viewBox: string, trim: boolean) {
  const [x, y, width, height] = viewBox.split(/\s+/).map(Number);
  if (!trim) {
    const side = Math.max(width, height);
    return [x - (side - width) / 2, y - (side - height) / 2, side, side]
      .map(round)
      .join(' ');
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;
  const box = new Resvg(svg).getBBox();
  if (!box) throw new Error('The icon has no visible artwork to measure.');
  const side = Math.max(box.width, box.height);
  return [
    box.x - (side - box.width) / 2,
    box.y - (side - box.height) / 2,
    side,
    side,
  ]
    .map(round)
    .join(' ');
}

const toCamel = (name: string) =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

function styleToJsx(style: string) {
  const entries = style
    .split(';')
    .map((rule) => rule.split(':').map((part) => part.trim()))
    .filter(([key, value]) => key && value)
    .map(([key, value]) => `${toCamel(key)}: '${value}'`);
  return `{{ ${entries.join(', ')} }}`;
}

function collectIds(body: string) {
  return Array.from(body.matchAll(/\sid="([^"]+)"/g), (match) => match[1]);
}

function toJsx(body: string) {
  const ids = collectIds(body);
  const suffixOf = Object.fromEntries(
    ids.map((id, i) => [
      id,
      String.fromCharCode(97 + (i % 26)) + (i >= 26 ? i : ''),
    ]),
  );
  const refersToId = (name: string, value: string) =>
    /url\(#/.test(value) || (/href$/.test(name) && value.slice(1) in suffixOf);
  const jsxValue = (value: string) =>
    value.replace(
      /url\(#([^)]+)\)|^#(.+)$/g,
      (match, urlId?: string, hrefId?: string) => {
        const id = urlId ?? hrefId ?? '';
        if (!(id in suffixOf)) return match;
        return urlId ? `url(#\${id}${suffixOf[id]})` : `#\${id}${suffixOf[id]}`;
      },
    );
  const jsx = body.replace(
    /<([\w:-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g,
    (_, tag: string, attrs: string, selfClose: string) => {
      const converted = Array.from(
        attrs.matchAll(/([\w:-]+)="([^"]*)"/g),
        ([, rawName, value]) => {
          if (rawName === 'id' && value in suffixOf)
            return `id={\`\${id}${suffixOf[value]}\`}`;
          if (rawName === 'style') return `style=${styleToJsx(value)}`;
          const name =
            rawName === 'class'
              ? 'className'
              : rawName === 'xlink:href'
                ? 'href'
                : /^(data|aria)-/.test(rawName)
                  ? rawName
                  : toCamel(rawName);
          if (refersToId(rawName, value))
            return `${name}={\`${jsxValue(value)}\`}`;
          return `${name}='${value}'`;
        },
      );
      return `<${tag}${converted.map((attr) => ` ${attr}`).join('')}${selfClose ? ' /' : ''}>`;
    },
  );
  return { jsx, hasIds: ids.length > 0 };
}

function prefixIdsForFile(body: string, prefix: string) {
  return collectIds(body).reduce(
    (text, id) =>
      text
        .replaceAll(`id="${id}"`, `id="${prefix}-${id}"`)
        .replaceAll(`url(#${id})`, `url(#${prefix}-${id})`)
        .replaceAll(`href="#${id}"`, `href="#${prefix}-${id}"`),
    body,
  );
}

function componentName(icon: string) {
  const name = icon.split(':')[1];
  return `${name.replace(/(^|[-_])(\w)/g, (_, __, letter: string) => letter.toUpperCase())}Mark`;
}

function buildComponent(
  name: string,
  viewBox: string,
  body: string,
  size: string,
) {
  const { jsx, hasIds } = toJsx(body);
  return [
    `export function ${name}({ className = '${size}' }: BrandMarkProps) {`,
    hasIds ? `  const id = useId().replace(/[^\\w-]/g, '');` : null,
    `  return (`,
    `    <svg viewBox='${viewBox}' aria-hidden='true' className={className}>`,
    `      ${jsx}`,
    `    </svg>`,
    `  );`,
    `}`,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

function writeIntoComponentFile(file: string, name: string, component: string) {
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf(`export function ${name}(`);
  const replaced =
    start === -1
      ? `${source.trimEnd()}\n\n${component}\n`
      : `${source.slice(0, start)}${component}${source.slice(source.indexOf('\n}\n', start) + 2)}`;
  const needsUseId =
    component.includes('useId()') &&
    !/import\s*\{[^}]*\buseId\b[^}]*\}\s*from 'react'/.test(replaced);
  const withImport = needsUseId
    ? `import { useId } from 'react';\n\n${replaced}`
    : replaced;
  writeFileSync(file, withImport);
  execFileSync('npx', ['prettier', '--write', file], { stdio: 'ignore' });
}

function upsertNotice(
  noticeFile: string,
  item: string,
  icon: string,
  info: IconifyInfo,
) {
  const header = [
    '# Third-party icons',
    '',
    'Fetched with `npm run icon:get` from the Iconify API (https://api.iconify.design). Each row names the icon set, its licence and author as the set publishes them. Brand marks remain trademarks of their owners and are shown only to name or link to that product.',
    '',
    '| Item | Icon | Set | Licence | Author |',
    '|---|---|---|---|---|',
  ].join('\n');
  const licence = info.license?.url
    ? `[${info.license.spdx ?? info.license.title}](${info.license.url})`
    : (info.license?.spdx ?? 'unknown');
  const author = info.author?.url
    ? `[${info.author.name}](${info.author.url})`
    : (info.author?.name ?? 'unknown');
  const row = `| \`${item}\` | \`${icon}\` | ${info.name} | ${licence} | ${author} |`;
  const existing = existsSync(noticeFile)
    ? readFileSync(noticeFile, 'utf8')
    : `${header}\n`;
  const lines = existing.trimEnd().split('\n');
  const at = lines.findIndex((line) => line.startsWith(`| \`${item}\` |`));
  const next =
    at === -1
      ? [...lines, row]
      : lines.map((line, i) => (i === at ? row : line));
  writeFileSync(noticeFile, `${next.join('\n')}\n`);
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (args.search) return search(args.search);
  if (!args.icon || !args.icon.includes(':')) {
    throw new Error(USAGE);
  }
  const [prefix, iconName] = args.icon.split(':');
  const info = await readCollection(prefix);
  const spdx = info.license?.spdx ?? 'unknown';
  if (!ALLOWED_LICENCES.has(spdx)) {
    throw new Error(
      `"${prefix}" is licensed ${spdx}, which icon:get does not allow. Pick another set (--search) or ask the owner.`,
    );
  }
  const iconSet = await getJson<IconifyJSON>(
    `${API}/${prefix}.json?icons=${encodeURIComponent(iconName)}`,
  );
  const data = getIconData(iconSet, iconName);
  if (!data) throw new Error(`No icon "${args.icon}". Try --search.`);
  const rendered = iconToSVG(data, { height: 'auto' });
  const body = cleanBody(rendered.body);
  const viewBox = squareViewBox(body, rendered.attributes.viewBox, args.trim);

  if (args.svg) {
    const prefixed = prefixIdsForFile(body, basename(args.svg, '.svg'));
    writeFileSync(
      args.svg,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${prefixed}</svg>\n`,
    );
    upsertNotice(
      join(dirname(args.svg), 'NOTICE.md'),
      basename(args.svg),
      args.icon,
      info,
    );
    console.log(`Wrote ${args.svg} (${info.name}, ${spdx}).`);
    return;
  }

  const name = args.name ?? componentName(args.icon);
  const component = buildComponent(name, viewBox, body, args.size);
  if (!args.into) {
    console.log(component);
    console.log(
      `\n// ${args.icon} · ${info.name} · ${spdx} · ${info.author?.name ?? ''}`,
    );
    return;
  }
  writeIntoComponentFile(args.into, name, component);
  upsertNotice(
    args.into.replace(/\.tsx?$/, '.NOTICE.md'),
    name,
    args.icon,
    info,
  );
  console.log(
    `Wrote ${name} into ${args.into} (${info.name}, ${spdx}); NOTICE updated.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
