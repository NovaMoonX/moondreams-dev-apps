// Words a section heading often opens with, dropped so "Make the cornbread" reads as "the cornbread".
const SECTION_LEADS =
  /^(?:for|to make|make|making|prepare|preparing|prep|assemble|assembling)\s+(?=\S)/i;
// A step that already opens with its own place in the order keeps it.
const ORDER_LEADS =
  /^(?:first|firstly|next|then|now|finally|lastly|last|to start|to begin|meanwhile|while|once|when|after|afterwards|before)\b/i;

const lowerFirst = (text: string) =>
  /^[A-Z][a-z]/.test(text) ? `${text[0].toLowerCase()}${text.slice(1)}` : text;

const withLead = (lead: string, text: string) =>
  ORDER_LEADS.test(text) ? text : `${lead}, ${lowerFirst(text)}`;

const toSectionLine = (name: string, isFirst: boolean) => {
  const trimmed = name.trim().replace(/[.:;]+$/, '');
  const subject = trimmed.replace(SECTION_LEADS, '');
  if (subject !== trimmed) {
    return isFirst
      ? `Let's start with ${lowerFirst(subject)}.`
      : `Now for ${lowerFirst(subject)}.`;
  }
  return isFirst ? `First up: ${trimmed}.` : `Next up: ${trimmed}.`;
};

/** A step as it is read aloud, in the way a person walks someone through a recipe: where it sits ("To start", "Next", "And finally"), a section said as it begins ("Let's start with the cornbread."), and the dish first on a plate of several; never "Step 1 of 5". */
export const toSpokenStep = ({
  number,
  count,
  text,
  section,
  dishTitle,
}: {
  number: number;
  count: number;
  text: string;
  /** The step's section, and whether this step is the first in it; null for none. */
  section: { name: string; isStart: boolean } | null;
  /** The dish the step is from, on a plate of several; null otherwise. */
  dishTitle: string | null;
}) => {
  const body = text.trim();
  const isFirst = number === 1;
  const isLast = number === count && count > 1;
  const sectionLine =
    section !== null && section.isStart && section.name.trim() !== ''
      ? toSectionLine(section.name, isFirst)
      : null;
  const getStepLine = () => {
    if (count <= 1) return body;
    if (sectionLine !== null) return isLast ? withLead('Finally', body) : body;
    if (isFirst) return withLead('To start', body);
    return isLast ? withLead('And finally', body) : withLead('Next', body);
  };
  return [
    dishTitle === null ? null : `${dishTitle.trim()}.`,
    sectionLine,
    getStepLine(),
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' ');
};
