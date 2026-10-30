import raw from '@/../docs/conventions/pipeline-log.md?raw';

export interface LogRow {
  date: string;
  scope: string;
  signal: string;
  change: string;
  outcome: string;
}

/** The pipeline log's table rows, newest first as written. */
export function parsePipelineLog(markdown: string): LogRow[] {
  return markdown
    .split('\n')
    .filter((line) => /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(line))
    .flatMap((line) => {
      const cells = line
        .trim()
        .replace(/^\||(?<!\\)\|$/g, '')
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim().replace(/\\\|/g, '|'));
      const [date, scope, signal, change, , outcome] = cells;
      if (!date || !scope || !change || !outcome) return [];
      return [
        {
          date,
          scope,
          signal: (signal ?? '').replace(/`/g, ''),
          change: change.replace(/`/g, ''),
          outcome,
        },
      ];
    });
}

export const LOG_ROWS = parsePipelineLog(raw);
