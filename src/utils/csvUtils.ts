const BOM = String.fromCharCode(0xfeff);

export type CsvCell = string | number | null;

const quoteCell = (cell: CsvCell) => {
  if (cell === null) return '';
  const text = String(cell);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Rows as CSV text (RFC 4180: CRLF line ends, a cell holding a comma, quote or line break quoted), every row padded to the widest one. */
export function toCsv(rows: CsvCell[][]): string {
  const width = Math.max(0, ...rows.map((row) => row.length));
  return rows
    .map((row) =>
      Array.from({ length: width }, (_, index) =>
        quoteCell(row[index] ?? null),
      ).join(','),
    )
    .join('\r\n');
}

/** CSV text as a file, with the byte-order mark spreadsheet apps need to read accents and emoji as UTF-8. */
export function toCsvFile(rows: CsvCell[][], fileName: string): File {
  return new File([`${BOM}${toCsv(rows)}\r\n`], fileName, {
    type: 'text/csv;charset=utf-8',
  });
}
