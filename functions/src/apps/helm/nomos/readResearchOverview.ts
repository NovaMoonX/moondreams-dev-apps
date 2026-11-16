import { RESEARCH_DEPTHS, type ResearchDepth } from './research.js';

export interface ResearchOverviewRead {
  summary: string;
  sections: { heading: string; points: string[] }[];
  comparison: { columns: string[]; rows: string[][] } | null;
}

export interface ResearchSourceRead {
  title: string;
  url: string;
  site: string;
}

export const OVERVIEW_SUMMARY_CAP = 600;
export const OVERVIEW_HEADING_CAP = 80;
export const OVERVIEW_POINT_CAP = 300;
export const OVERVIEW_POINTS_MAX = 6;
export const OVERVIEW_CELL_CAP = 80;
export const OVERVIEW_COLUMNS_MAX = 5;
export const OVERVIEW_ROWS_MAX = 8;
export const SOURCES_MAX = 12;
const SOURCE_TEXT_CAP = 120;
const URL_CAP = 500;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toWords = (value: unknown, cap: number) =>
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, cap).trim()
    : '';

const toList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

/** A web address kept only when it is a plain https link, so a model's text never becomes a script or a file link. */
const toHttpsUrl = (value: unknown) => {
  const text = toWords(value, URL_CAP);
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && url.hostname.includes('.')
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

const readComparison = (value: unknown): ResearchOverviewRead['comparison'] => {
  if (!isRecord(value)) return null;
  const columns = toList(value.columns)
    .map((cell) => toWords(cell, OVERVIEW_CELL_CAP))
    .slice(0, OVERVIEW_COLUMNS_MAX);
  if (columns.length < 2 || columns.some((cell) => cell === '')) return null;
  const rows = toList(value.rows)
    .map((row) =>
      toList(row)
        .map((cell) => toWords(cell, OVERVIEW_CELL_CAP))
        .slice(0, columns.length),
    )
    .filter((row) => row.length === columns.length)
    .slice(0, OVERVIEW_ROWS_MAX);
  return rows.length > 0 ? { columns, rows } : null;
};

/** The overview and sources the model submitted, cut to the depth's caps; null when there is no summary to show. */
export function readResearchOverview(
  raw: unknown,
  depth: ResearchDepth,
): { overview: ResearchOverviewRead; sources: ResearchSourceRead[] } | null {
  if (!isRecord(raw)) return null;
  const summary = toWords(raw.summary, OVERVIEW_SUMMARY_CAP);
  if (summary === '') return null;
  const budget = RESEARCH_DEPTHS[depth];
  const sections = toList(raw.sections)
    .filter(isRecord)
    .map((section) => ({
      heading: toWords(section.heading, OVERVIEW_HEADING_CAP),
      points: toList(section.points)
        .map((point) => toWords(point, OVERVIEW_POINT_CAP))
        .filter((point) => point !== '')
        .slice(0, OVERVIEW_POINTS_MAX),
    }))
    .filter((section) => section.heading !== '' && section.points.length > 0)
    .slice(0, budget.maxSections);
  const seen = new Set<string>();
  const sources = toList(raw.sources)
    .filter(isRecord)
    .flatMap((source): ResearchSourceRead[] => {
      const url = toHttpsUrl(source.url);
      if (url === null || seen.has(url)) return [];
      seen.add(url);
      const site =
        toWords(source.site, SOURCE_TEXT_CAP) ||
        new URL(url).hostname.replace(/^www\./, '');
      return [
        { title: toWords(source.title, SOURCE_TEXT_CAP) || site, url, site },
      ];
    })
    .slice(0, SOURCES_MAX);
  return {
    overview: {
      summary,
      sections,
      comparison: budget.hasComparison ? readComparison(raw.comparison) : null,
    },
    sources,
  };
}
