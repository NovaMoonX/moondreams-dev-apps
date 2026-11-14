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
    .replace(
      /(\s[\w:-]+)='([^']*)'/g,
      (_, name: string, value: string) =>
        `${name}="${value.replace(/"/g, '&quot;')}"`,
    )
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(title|desc|metadata)\b[\s\S]*?<\/\1>/g, '')
    .replace(/\s(data-[\w-]+|xml:space|version|xmlns(:\w+)?)="[^"]*"/g, '')
    .trim();
}

const XMLNS =
  'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';

// Masks, blurs and strokes all change what is painted, so the artwork is measured from pixels.
function artworkBounds(body: string, viewBox: string) {
  const [x, y, width, height] = viewBox.split(/\s+/).map(Number);
  const pad = Math.max(width, height) / 2;
  const frame = [x - pad, y - pad, width + 2 * pad, height + 2 * pad];
  const svg = `<svg ${XMLNS} viewBox="${frame.join(' ')}">${body}</svg>`;
  const image = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1024 },
  }).render();
  const scale = frame[2] / image.width;
  const rowBytes = image.width * 4;
  const isPainted = (value: number, i: number) => i % 4 === 3 && value > 8;
  const edges = Array.from({ length: image.height }, (_, row) =>
    image.pixels.subarray(row * rowBytes, (row + 1) * rowBytes),
  ).reduce(
    (box, line, row) => {
      const first = line.findIndex(isPainted);
      if (first === -1) return box;
      const last = line.findLastIndex(isPainted);
      return {
        left: Math.min(box.left, Math.floor(first / 4)),
        top: Math.min(box.top, row),
        right: Math.max(box.right, Math.floor(last / 4) + 1),
        bottom: Math.max(box.bottom, row + 1),
      };
    },
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
  );
  if (edges.right < 0) throw new Error('The icon paints nothing to measure.');
  return {
    x: frame[0] + edges.left * scale,
    y: frame[1] + edges.top * scale,
    width: (edges.right - edges.left) * scale,
    height: (edges.bottom - edges.top) * scale,
  };
}

function squareViewBox(body: string, viewBox: string, trim: boolean) {
  const [x, y, width, height] = viewBox.split(/\s+/).map(Number);
  const box = trim ? artworkBounds(body, viewBox) : { x, y, width, height };
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

const URL_REF = /url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g;

function idSuffixes(body: string) {
  const ids = Array.from(body.matchAll(/\sid="([^"]+)"/g), (match) => match[1]);
  return new Map(
    ids.map((id, i) => [
      id,
      String.fromCharCode(97 + (i % 26)) + (i >= 26 ? i : ''),
    ]),
  );
}

function toJsx(body: string) {
  const suffixOf = idSuffixes(body);
  const withIds = (value: string) =>
    value
      .replace(URL_REF, (match, id: string) =>
        suffixOf.has(id) ? `url(#\${id}${suffixOf.get(id)})` : match,
      )
      .replace(/^#(.+)$/, (match, id: string) =>
        suffixOf.has(id) ? `#\${id}${suffixOf.get(id)}` : match,
      );
  const jsxValue = (name: string, value: string) => {
    const refers =
      [...value.matchAll(URL_REF)].some(([, id]) => suffixOf.has(id)) ||
      (/href$/.test(name) && suffixOf.has(value.slice(1)));
    return refers ? `{\`${withIds(value)}\`}` : `"${value}"`;
  };
  const styleToJsx = (style: string) => {
    const entries = style
      .split(';')
      .map((rule) => [
        rule.slice(0, rule.indexOf(':')),
        rule.slice(rule.indexOf(':') + 1),
      ])
      .map(([key, value]) => [key.trim(), value.trim()])
      .filter(([key, value]) => key && value)
      .map(([key, value]) => {
        const name = key.startsWith('--') ? JSON.stringify(key) : toCamel(key);
        const refers = [...value.matchAll(URL_REF)].some(([, id]) =>
          suffixOf.has(id),
        );
        return `${name}: ${refers ? `\`${withIds(value)}\`` : JSON.stringify(value)}`;
      });
    return `{{ ${entries.join(', ')} }}`;
  };
  const tagPattern = /<([\w:-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  const openingTags = body.match(/<[a-zA-Z]/g)?.length ?? 0;
  const convertible = body.match(tagPattern)?.length ?? 0;
  if (openingTags !== convertible)
    throw new Error(
      'The icon has a tag icon:get cannot convert (an attribute without a value?). Pick another icon or convert it by hand.',
    );
  if (/[{}]/.test(body.replace(/<[^>]*>/g, '')))
    throw new Error(
      'The icon has a <style> block or text with braces, which icon:get does not convert. Pick another icon.',
    );
  const jsx = body.replace(
    tagPattern,
    (_, tag: string, attrs: string, selfClose: string) => {
      const converted = Array.from(
        attrs.matchAll(/([\w:-]+)="([^"]*)"/g),
        ([, rawName, value]) => {
          if (rawName === 'id' && suffixOf.has(value))
            return `id={\`\${id}${suffixOf.get(value)}\`}`;
          if (rawName === 'style') return `style=${styleToJsx(value)}`;
          const name =
            rawName === 'class'
              ? 'className'
              : rawName === 'xlink:href'
                ? 'href'
                : /^(data|aria)-/.test(rawName)
                  ? rawName
                  : toCamel(rawName);
          return `${name}=${jsxValue(rawName, value)}`;
        },
      );
      return `<${tag}${converted.map((attr) => ` ${attr}`).join('')}${selfClose ? ' /' : ''}>`;
    },
  );
  return { jsx, hasIds: suffixOf.size > 0 };
}

function prefixIdsForFile(body: string, prefix: string) {
  const ids = new Set(idSuffixes(body).keys());
  return body
    .replace(/(\sid=")([^"]+)"/g, (match, start: string, id: string) =>
      ids.has(id) ? `${start}${prefix}-${id}"` : match,
    )
    .replace(URL_REF, (match, id: string) =>
      ids.has(id) ? `url(#${prefix}-${id})` : match,
    )
    .replace(/(href=")#([^"]+)"/g, (match, start: string, id: string) =>
      ids.has(id) ? `${start}#${prefix}-${id}"` : match,
    );
}

const isIdentifier = (name: string) => /^[A-Z][A-Za-z0-9]*$/.test(name);

function componentName(icon: string) {
  const words = icon
    .split(':')[1]
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  const name = words
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('');
  return /^[0-9]/.test(name) ? `Icon${name}Mark` : `${name}Mark`;
}

function buildComponent(
  name: string,
  viewBox: string,
  body: string,
  size: string,
  propsType: string,
) {
  const { jsx, hasIds } = toJsx(body);
  return [
    `export function ${name}({ className = '${size}' }: ${propsType}) {`,
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

function propsTypeFor(file: string | null) {
  if (!file || !existsSync(file)) return '{ className?: string }';
  return /\b(interface|type) BrandMarkProps\b/.test(readFileSync(file, 'utf8'))
    ? 'BrandMarkProps'
    : '{ className?: string }';
}

function withReactImport(source: string) {
  const reactImport = /import \{([^}]*)\} from 'react';\n/;
  const needs = /\buseId\(/.test(source);
  const match = source.match(reactImport);
  const names = (match?.[1] ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== 'useId');
  const wanted = needs ? [...names, 'useId'].sort() : names;
  const line =
    wanted.length > 0 ? `import { ${wanted.join(', ')} } from 'react';\n` : '';
  if (match) return source.replace(reactImport, line);
  return line ? `${line}\n${source}` : source;
}

function writeIntoComponentFile(file: string, name: string, component: string) {
  const source = readFileSync(file, 'utf8');
  const start = source.search(new RegExp(`export (function|const) ${name}\\b`));
  const end = start === -1 ? -1 : source.indexOf('\n}', start);
  if (start !== -1 && end === -1)
    throw new Error(
      `Found ${name} in ${file} but not where it ends; replace it by hand.`,
    );
  const replaced =
    start === -1
      ? `${source.trimEnd()}\n\n${component}\n`
      : `${source.slice(0, start)}${component}${source.slice(end + 2).replace(/^;/, '')}`;
  writeFileSync(file, withReactImport(replaced));
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
  execFileSync('npx', ['prettier', '--write', noticeFile], { stdio: 'ignore' });
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
  if (!isIdentifier(name))
    throw new Error(`"${name}" is not a component name; pass --name.`);
  const component = buildComponent(
    name,
    viewBox,
    body,
    args.size,
    propsTypeFor(args.into),
  );
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
