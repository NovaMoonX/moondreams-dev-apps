import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import {
  COMING_WORDS,
  LIFECYCLE_WORDS,
  PART_OF_WORDS,
} from '@apps/runway/constants';
import { DAY_MS } from '@apps/runway/engine/dates';
import {
  getEndChangeId,
  type ComingChange,
} from '@apps/runway/engine/horizonLinks';
import type { PlanChange } from '@apps/runway/engine/planChanges';
import type { OpenVersion } from '@apps/runway/types';
import {
  describeChange,
  type ItemPayload,
} from '@apps/runway/utils/changeText';
import { getChangeFigure } from '@apps/runway/utils/planChangeText';

type CardNamer = (cardId: string | null) => string;

/** A coming change as the Days screens read it, so one sheet and one set of words serve both. */
export const toPlanChange = (
  change: ComingChange<OpenVersion>,
): PlanChange => ({
  what: change.kind,
  on: change.on,
  startsOn: change.on,
  itemId: change.version.itemId,
  kind: change.version.kind,
  isReturn: change.isReturn,
  before: change.before,
  after: change.version,
});

/** The id a link to the change carries, and its first day: what the change's own sheet is opened with. */
export const getChangeRef = (change: PlanChange) => ({
  changeId:
    change.what === 'stop'
      ? getEndChangeId(change.itemId)
      : change.after.changeId,
  on: change.on,
});

/** "$80 → $40", or the fields that differ in words; null when nothing about the item's figures differs. */
export function describeChangeFigures(
  change: PlanChange,
  cardNamer: CardNamer,
): string | null {
  const before = getChangeFigure(change.before);
  const after = getChangeFigure(change.after);
  if (before && after && before.text !== after.text)
    return `${before.text} → ${after.text}`;
  const difference = describeChange(
    change.before.payload as ItemPayload,
    change.after.payload as ItemPayload,
    cardNamer,
  );
  return difference === '' ? null : difference.replace(/ to /g, ' → ');
}

/** The one line a coming change gets on an item's sheet: "Changes Dec 1st: $80 → $40", "Ends after Dec 1st", "Starts Dec 1st", "Back to $80 after Jan 3rd". Carries amounts, so it is drawn masked. */
export function describeComingHeadline(
  change: PlanChange,
  cardNamer: CardNamer,
): string {
  const lastDay = formatDateOrdinalUTC(change.on - DAY_MS);
  if (change.what === 'stop') return `${LIFECYCLE_WORDS.endsAfter} ${lastDay}`;
  if (change.what === 'start')
    return COMING_WORDS.startsOn(formatDateOrdinalUTC(change.on));
  const figures = describeChangeFigures(change, cardNamer);
  if (change.isReturn) {
    const back = getChangeFigure(change.after);
    if (back) return PART_OF_WORDS.comingBackTo(back.text, lastDay);
    return figures === null
      ? COMING_WORDS.backAfter(lastDay)
      : PART_OF_WORDS.comingBack(lastDay, figures);
  }
  const date = formatDateOrdinalUTC(change.on);
  return figures === null
    ? COMING_WORDS.changesOnPlain(date)
    : COMING_WORDS.changesOn(date, figures);
}

/** What cancelling asks about, naming the change: "Cancel Eating out $80 → $40 from Dec 1st?". */
export function describeCancelTitle(
  change: PlanChange,
  cardNamer: CardNamer,
): string {
  const name = change.after.payload.name;
  const date = formatDateOrdinalUTC(change.on);
  if (change.what === 'stop')
    return COMING_WORDS.cancelTitleStop(
      name,
      formatDateOrdinalUTC(change.on - DAY_MS),
    );
  if (change.what === 'start') return COMING_WORDS.cancelTitleStart(name, date);
  const figures = describeChangeFigures(change, cardNamer);
  return figures === null
    ? COMING_WORDS.cancelTitlePlain(name, date)
    : COMING_WORDS.cancelTitleChange(name, figures, date);
}
