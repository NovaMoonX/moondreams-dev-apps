import { BUDGET_PASTED_NAME } from '@apps/runway/constants';

/** A document's name as the model sees it: no line breaks or dash runs that could pass for the lines around a document. */
const toSentName = (name: string) =>
  name.replace(/\s*[\r\n]+\s*/g, ' ').replace(/-{2,}/g, '-');

export interface DocumentName {
  /** What the person sees. */
  shown: string;
  /** What the model is told. */
  sent: string;
}

const withSuffix = (name: string, count: number) => {
  const dot = name.lastIndexOf('.');
  return dot > 0
    ? `${name.slice(0, dot)} (${count})${name.slice(dot)}`
    : `${name} (${count})`;
};

/** Names each file, and the pasted text when there is some, so that no two documents in one reading or across several share a name. A repeat of a file name gets "(2)"; pasted text becomes "Pasted text 2". */
export function nameDocuments(
  files: readonly File[],
  hasPasted: boolean,
  taken: readonly string[],
): { files: DocumentName[]; pasted: DocumentName | null } {
  const used = new Set(taken.map(toSentName));
  const claim = (make: (count: number) => string) => {
    const count = Array.from({ length: 1000 }, (_, index) => index + 1).find(
      (candidate) => !used.has(toSentName(make(candidate))),
    );
    const shown = make(count ?? used.size + 1);
    used.add(toSentName(shown));
    return { shown, sent: toSentName(shown) };
  };
  return {
    files: files.map((file) =>
      claim((count) =>
        count === 1 ? file.name : withSuffix(file.name, count),
      ),
    ),
    pasted: hasPasted
      ? claim((count) =>
          count === 1 ? BUDGET_PASTED_NAME : `${BUDGET_PASTED_NAME} ${count}`,
        )
      : null,
  };
}
