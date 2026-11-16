import { formatList } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import type {
  ImportanceItem,
  ImportanceOrder,
} from '@apps/helm/engine/importance';

export interface PlaceWords {
  text: string;
  /** Always kept things have no place to open. */
  canOpen: boolean;
  /** The row the order opens on: the thing itself, or the goal a habit sits under. */
  focusId: string;
}

interface PlaceWordsInput {
  order: ImportanceOrder;
  items: readonly ImportanceItem[];
  id: string;
  /** Habits that take their goal's place: never numbered, never sharing a place. */
  underGoalIds: readonly string[];
  emojiOf: (id: string) => string | null;
  /** An instant the person said it at. */
  formatSaid: (instant: number) => string;
  /** A date-only day. */
  formatDay: (day: number) => string;
}

/** One thing's place in the person's words ("2nd of 3 in what matters"), or null when it is not in the order (finished, unreadable). */
export function readPlaceWords({
  order,
  items,
  id,
  underGoalIds,
  emojiOf,
  formatSaid,
  formatDay,
}: PlaceWordsInput): PlaceWords | null {
  if (order.alwaysKept.includes(id)) {
    return {
      text: HELM_COPY.importanceRowAlwaysKept,
      canOpen: false,
      focusId: id,
    };
  }
  const row = order.rows.find((entry) => entry.id === id);
  if (!row) return null;
  const item = items.find((entry) => entry.id === id);
  const goal =
    row.kind === 'habit' &&
    item?.goalId &&
    (row.isInherited || row.place === null)
      ? (items.find((entry) => entry.id === item.goalId) ?? null)
      : null;
  const goalRow = goal
    ? order.rows.find((entry) => entry.id === goal.id)
    : null;
  if (goal) {
    const emoji = emojiOf(goal.id);
    return {
      text: HELM_COPY.importanceRowThrough(
        emoji ? `${emoji} ${goal.name}` : goal.name,
        goalRow?.position ?? null,
      ),
      canOpen: true,
      focusId: goal.id,
    };
  }
  const stamp = row.place
    ? row.place.words === null
      ? HELM_COPY.importanceYouMoved(formatSaid(row.place.saidAt))
      : HELM_COPY.importanceYouSaid(formatSaid(row.place.saidAt))
    : null;
  const done = (text: string): PlaceWords => ({
    text,
    canOpen: true,
    focusId: id,
  });
  if (row.group === 'canWait') {
    const label = HELM_COPY.importanceRowCanWait(null);
    return done(stamp === null ? label : `${label} \u00b7 ${stamp}`);
  }
  if (row.group === 'notSaid') {
    return done(
      row.date === null
        ? HELM_COPY.importanceRowNotSaid
        : HELM_COPY.importanceRowNotSaidByDate(formatDay(row.date)),
    );
  }
  const position = row.position ?? 1;
  const sharers = order.inOrder.filter(
    (entry) =>
      entry.id !== id &&
      entry.position === position &&
      !underGoalIds.includes(entry.id),
  );
  if (sharers.length > 0) {
    const names = sharers.map(
      (entry) => items.find((other) => other.id === entry.id)?.name ?? '',
    );
    return done(HELM_COPY.importanceRowShares(position, formatList(names)));
  }
  if (position === 1) {
    return done(
      stamp === null
        ? HELM_COPY.importanceRowFirst
        : `${HELM_COPY.importanceRowFirst} \u00b7 ${stamp}`,
    );
  }
  const places = Math.max(...order.inOrder.map((entry) => entry.position ?? 1));
  return done(HELM_COPY.importanceRowNth(position, places));
}
