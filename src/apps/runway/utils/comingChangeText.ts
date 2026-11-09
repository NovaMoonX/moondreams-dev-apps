import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import {
  COMING_WORDS,
  LIFECYCLE_WORDS,
  PART_OF_WORDS,
} from '@apps/runway/constants';
import { DAY_MS } from '@apps/runway/engine/dates';
import {
  getEndChangeId,
  getItemEnds,
  getItemStops,
  getLinkSpan,
  listCancellableLinks,
  listComingChanges,
  type CancelTarget,
  type ComingChange,
} from '@apps/runway/engine/horizonLinks';
import type { PlanChange } from '@apps/runway/engine/planChanges';
import type { HorizonLink, OpenVersion, PlanItemDoc } from '@apps/runway/types';
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

/** The one line a coming change gets on an item's sheet: "$80 → $40 from Dec 1st" (the change line without the name), "Ends after Dec 1st", "Starts Dec 1st", "Back to $80 after Jan 3rd". Carries amounts, so it is drawn masked. */
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

/** Pays and bills whose start an event holds and is still ahead. A pay or bill added the usual way, whose first money day is simply ahead, is not a coming change. */
export function listStartChanges(
  versions: readonly OpenVersion[],
  items: readonly PlanItemDoc[],
  today: number,
  isHeld: (link: { changeId: string; itemId: string }) => boolean,
): PlanChange[] {
  const stops = getItemStops(items);
  const ends = getItemEnds(items);
  return items
    .filter(({ kind }) => kind === 'payLine' || kind === 'bill')
    .flatMap((item) =>
      [
        ...new Set(
          versions
            .filter((version) => version.itemId === item.id)
            .map(({ changeId }) => changeId),
        ),
      ].flatMap((changeId) => {
        const span = getLinkSpan(
          versions,
          { changeId, itemId: item.id },
          stops,
          ends,
        );
        return span &&
          span.kind === 'start' &&
          span.before === null &&
          span.isLive &&
          span.startsOn > today &&
          isHeld({ changeId, itemId: item.id })
          ? [
              {
                what: 'start',
                on: span.startsOn,
                startsOn: span.startsOn,
                itemId: item.id,
                kind: span.version.kind,
                isReturn: false,
                before: span.version,
                after: span.version,
              } satisfies PlanChange,
            ]
          : [];
      }),
    );
}

/** Everything coming for one item in date order: its changes, its ending and a start that is still ahead. */
export const listItemChanges = (
  versions: readonly OpenVersion[],
  item: PlanItemDoc | null,
  itemId: string,
  today: number,
  isHeld: (link: { changeId: string; itemId: string }) => boolean,
): PlanChange[] =>
  [
    ...listComingChanges(versions, itemId, today, item?.endedAt ?? null).map(
      toPlanChange,
    ),
    ...(item ? listStartChanges(versions, [item], today, isHeld) : []),
  ].sort((a, b) => a.on - b.on);

/** The one wording of a change on every surface: "Eating out: $80 → $40 from Nov 13th", "Streaming ends after Dec 15th", "Paycheck starts Dec 9th". Carries amounts, so it is drawn masked. */
export function describeChangeLine(
  change: PlanChange,
  cardNamer: CardNamer,
): string {
  const name = change.after.payload.name;
  const date = formatDateOrdinalUTC(change.on);
  const lastDay = formatDateOrdinalUTC(change.on - DAY_MS);
  if (change.what === 'stop') return COMING_WORDS.lineEnds(name, lastDay);
  if (change.what === 'start') return COMING_WORDS.lineStarts(name, date);
  if (change.isReturn) {
    const back = getChangeFigure(change.after);
    return back
      ? COMING_WORDS.lineReturns(name, back.text, lastDay)
      : COMING_WORDS.lineReturnsPlain(name, lastDay);
  }
  const before = getChangeFigure(change.before);
  const after = getChangeFigure(change.after);
  if (change.kind === 'goal' && after?.isZero && !before?.isZero)
    return COMING_WORDS.lineStopsSaving(name, date);
  const figures = describeChangeFigures(change, cardNamer);
  return figures === null
    ? COMING_WORDS.lineChangesPlain(name, date)
    : COMING_WORDS.lineChanges(name, figures, date);
}

/** What calling an event off asks about: each linked change that has not started and can be cancelled, in date order, with what cancelling writes and the change as the screens word it. */
export function listCallOffChanges(
  links: readonly HorizonLink[],
  versions: readonly OpenVersion[],
  items: readonly PlanItemDoc[],
  today: number,
): { link: HorizonLink; target: CancelTarget; change: PlanChange }[] {
  return listCancellableLinks(links, versions, items, today)
    .flatMap(({ link, target }) => {
      const change = listItemChanges(
        versions,
        items.find(({ id }) => id === link.itemId) ?? null,
        link.itemId,
        today,
        () => true,
      ).find(
        (found) =>
          !found.isReturn && getChangeRef(found).changeId === link.changeId,
      );
      return change ? [{ link, target, change }] : [];
    })
    .sort((a, b) => a.change.on - b.change.on);
}

/** What goes back when a change is cancelled: "Eating out stays at $80", "Streaming keeps going", "Paycheck does not start". */
export function describeCancelOutcome(change: PlanChange): string {
  const name = change.after.payload.name;
  if (change.what === 'stop') return COMING_WORDS.outcomeStop(name);
  if (change.what === 'start') return COMING_WORDS.outcomeStart(name);
  const before = getChangeFigure(change.before);
  return before
    ? COMING_WORDS.outcomeStays(name, before.text)
    : COMING_WORDS.outcomePlain(name);
}
