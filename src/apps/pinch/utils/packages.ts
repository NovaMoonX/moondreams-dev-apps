import { toDateInputValue, fromDateInputValue } from '@/utils/dateInputUtils';
import { formatList } from '@/utils/formatUtils';
import {
  MAX_NAME_LENGTH,
  MAX_PACKAGE_HISTORY,
  MAX_PACKAGE_NOTE_LENGTH,
  PACKAGE_DATE_CHOICES,
  PACKAGE_PLACE_LABELS,
  SOFT_MAX_PACKAGES,
  UNIT_DIMENSION,
  UNIT_TO_BASE,
  type ShopSection,
} from '@apps/pinch/constants';
import type {
  Dimension,
  Package,
  PackageEvent,
  PackageEventKind,
  PackagePlace,
  Recipe,
  Unit,
} from '@apps/pinch/types';
import {
  getEatByLabel,
  getEatByState,
  getNamesLine,
  isValidEatBy,
  type EatByState,
} from '@apps/pinch/utils/containers';
import {
  DAY_MS,
  formatDayShort,
  getLocalTodayDate,
  getPlannedDayKey,
} from '@apps/pinch/utils/dayKeys';
import { formatKitchenAmount } from '@apps/pinch/utils/kitchenMeasure';
import { formatSize } from '@apps/pinch/utils/productFormat';
import { bridge, toBase, type Conversions } from '@apps/pinch/utils/quantity';

const round2 = (value: number) => Math.round(value * 100) / 100;

/** A cooked amount close enough to what is left counts as all of it, so a package never keeps a crumb of 0.004. */
const EPSILON = 0.005;

export const isValidPackageAmount = (amount: number) =>
  Number.isFinite(amount) && amount > 0 && amount <= 1_000_000;

export const isValidExpiresAt = (expiresAt: number | null) =>
  expiresAt === null || isValidEatBy(expiresAt);

export const isPackageListFull = (inStockCount: number, adding = 1) =>
  inStockCount + adding > SOFT_MAX_PACKAGES;

export type PackageState = EatByState | 'NONE';

/** A package's date state with the person's lead days as its "soon" window; no date is its own state, never "later". */
export const getPackageState = (
  expiresAt: number | null,
  now = Date.now(),
  soonDays?: number,
): PackageState =>
  expiresAt === null ? 'NONE' : getEatByState(expiresAt, now, soonDays);

/** "Past its date", "Use today", "Use by Fri"; null without a date. */
export const getPackageLabel = (expiresAt: number | null, now = Date.now()) =>
  expiresAt === null ? null : getEatByLabel(expiresAt, now, 'Use');

/** Soonest date first, no date last, then the older package, so a list never reshuffles between two reads. */
export const byUseBy = (
  a: Pick<Package, 'expiresAt' | 'createdAt' | 'id'>,
  b: Pick<Package, 'expiresAt' | 'createdAt' | 'id'>,
) => {
  if (a.expiresAt !== b.expiresAt) {
    if (a.expiresAt === null) return 1;
    if (b.expiresAt === null) return -1;
    return a.expiresAt - b.expiresAt;
  }
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
};

const placeWord = (place: PackagePlace) =>
  PACKAGE_PLACE_LABELS[place].toLowerCase();

export const getPlaceText = (place: PackagePlace) => `the ${placeWord(place)}`;

/** Past the cap the oldest USED goes first, then the oldest EDITED, then the oldest after the first: how it came in and where it ended stay readable. */
export const appendPackageEvent = (
  history: PackageEvent[],
  event: PackageEvent,
): PackageEvent[] => {
  const next = [...history, event];
  if (next.length <= MAX_PACKAGE_HISTORY) return next;

  const oldestAfterFirst = (kind: PackageEventKind) =>
    next.findIndex(
      (entry, index) =>
        index > 0 && index < next.length - 1 && entry.kind === kind,
    );
  const dropped =
    [oldestAfterFirst('USED'), oldestAfterFirst('EDITED')].find(
      (index) => index !== -1,
    ) ?? 1;
  return next.filter((_, index) => index !== dropped);
};

export const makePackageEvent = (
  kind: PackageEventKind,
  at: number,
  details: {
    amount?: number | null;
    place?: PackagePlace | null;
    note?: string | null;
  } = {},
): PackageEvent => ({
  kind,
  at,
  amount: details.amount ?? null,
  place: details.place ?? null,
  note: details.note?.slice(0, MAX_PACKAGE_NOTE_LENGTH) ?? null,
});

export interface NewPackageInput {
  id: string;
  ingredientId: string;
  ingredientName: string;
  productId: string | null;
  amount: number;
  unit: Unit;
  place: PackagePlace;
  expiresAt: number | null;
}

export const buildPackage = (input: NewPackageInput, now: number): Package => ({
  ...input,
  ingredientName: input.ingredientName.trim().slice(0, MAX_NAME_LENGTH),
  amount: round2(input.amount),
  openedAt: null,
  status: 'IN_STOCK',
  history: [
    makePackageEvent('ADDED', now, {
      amount: round2(input.amount),
      place: input.place,
    }),
  ],
  createdAt: now,
  updatedAt: now,
});

export const getNewPackagesProblem = (
  inputs: Omit<NewPackageInput, 'id'>[],
  inStockCount: number,
) => {
  const invalid = inputs.find(
    (input) =>
      input.ingredientId === '' ||
      input.ingredientName.trim() === '' ||
      !isValidPackageAmount(input.amount) ||
      !isValidExpiresAt(input.expiresAt),
  );
  if (invalid !== undefined) {
    return invalid.ingredientId === ''
      ? 'Pick what it is.'
      : 'Check the amount and the date.';
  }
  if (isPackageListFull(inStockCount, inputs.length)) {
    return inStockCount >= SOFT_MAX_PACKAGES
      ? `You have ${SOFT_MAX_PACKAGES} packages in your pantry. Finish or delete one to add more.`
      : `That would pass the ${SOFT_MAX_PACKAGES} packages you can keep. Finish or delete some first.`;
  }
  return null;
};

/** "Use by Oct 25" as it reads inside a sentence: "use by Oct 25". */
export const lowerFirst = (text: string) =>
  `${text.charAt(0).toLowerCase()}${text.slice(1)}`;

/** The date of a quick answer: that many days from the viewer's today. */
export const getDateInDays = (days: number, now = Date.now()) =>
  getLocalTodayDate(now) + days * DAY_MS;

export type DateChoice =
  (typeof PACKAGE_DATE_CHOICES)[number]['value'] | 'PICK' | 'NONE';

/** The answer to "when does it expire?": nothing chosen yet, a quick answer, a date picked by hand, or no date. */
export interface DateAnswer {
  choice: DateChoice | null;
  /** The date input's text, used by the picked-by-hand answer. */
  picked: string;
}

export const NO_DATE_ANSWER: DateAnswer = { choice: null, picked: '' };

/** The answer that already holds a package's date: no date, or the date to change. */
export const getDateAnswer = (expiresAt: number | null): DateAnswer =>
  expiresAt === null
    ? { choice: 'NONE', picked: '' }
    : { choice: 'PICK', picked: toDateInputValue(expiresAt) };

/** What an answer means: whether it is a whole answer yet, and the date it gives (null for no date). A date picked by hand counts once it reads as a real day. */
export const getAnswerDate = (answer: DateAnswer, now = Date.now()) => {
  if (answer.choice === null) return { isAnswered: false, expiresAt: null };
  if (answer.choice === 'NONE') return { isAnswered: true, expiresAt: null };
  if (answer.choice === 'PICK') {
    const picked = fromDateInputValue(answer.picked) ?? null;
    return picked !== null && isValidEatBy(picked)
      ? { isAnswered: true, expiresAt: picked }
      : { isAnswered: false, expiresAt: null };
  }
  const days =
    PACKAGE_DATE_CHOICES.find((choice) => choice.value === answer.choice)
      ?.days ?? 0;
  return { isAnswered: true, expiresAt: getDateInDays(days, now) };
};

/** Where a thing from this part of the shop usually goes, as a starting answer the person can change. */
export const getDefaultPlace = (section: ShopSection): PackagePlace => {
  if (section === 'frozen') return 'FREEZER';
  return section === 'dairy' || section === 'meat' || section === 'produce'
    ? 'FRIDGE'
    : 'PANTRY';
};

/** The typed amount as a number; NaN while it is blank or not a number. */
export const parseAmountText = (text: string) =>
  text.trim() === '' ? Number.NaN : Number(text);

export interface AmountTotal {
  dimension: Dimension;
  unit: Unit;
  amount: number;
}

const DIMENSION_ORDER: Dimension[] = ['MASS', 'VOLUME', 'COUNT'];

/** Amounts added up per kind (weights with weights, volumes with volumes, counts with counts), each in the unit of its largest part. A different kind is its own total and is never converted. */
export const sumAmounts = (
  parts: { amount: number; unit: Unit }[],
): AmountTotal[] =>
  DIMENSION_ORDER.flatMap((dimension) => {
    const inKind = parts
      .filter((part) => UNIT_DIMENSION[part.unit] === dimension)
      .map((part) => ({
        unit: part.unit,
        base: part.amount * UNIT_TO_BASE[part.unit],
      }));
    if (inKind.length === 0) return [];

    const lead = inKind.reduce((best, part) =>
      part.base > best.base ? part : best,
    );
    const total = inKind.reduce((sum, part) => sum + part.base, 0);
    return [
      {
        dimension,
        unit: lead.unit,
        amount: round2(total / UNIT_TO_BASE[lead.unit]),
      },
    ];
  });

export const formatTotal = (total: Pick<AmountTotal, 'amount' | 'unit'>) =>
  formatSize(total.amount, total.unit);

/** An amount said the way a cook says it ("2½ cups", "about ½ lb"); a bare count keeps its "each" so it still reads as an amount, and "about" is said once. */
export const formatKitchenTotal = (
  total: Pick<AmountTotal, 'amount' | 'unit'>,
  isConverted = false,
) => {
  const text = formatKitchenAmount(total.amount, total.unit);
  const bare = text.replace(/^about /, '');
  const isAbout = isConverted || bare !== text;
  return `${isAbout ? 'about ' : ''}${total.unit === 'EACH' ? `${bare} each` : bare}`;
};

export interface StockView {
  ingredientId: string;
  /** In stock, soonest date first. */
  packages: Package[];
  /** What is physically there, per kind, past-date packages included. */
  totals: AmountTotal[];
  pastCount: number;
  soonCount: number;
  /** The soonest package that has a date, past ones included. */
  nearest: Package | null;
}

export const getStockView = (
  ingredientId: string,
  packages: Package[],
  now = Date.now(),
  soonDays?: number,
): StockView => {
  const sorted = [...packages].sort(byUseBy);
  const states = sorted.map((pkg) =>
    getPackageState(pkg.expiresAt, now, soonDays),
  );
  return {
    ingredientId,
    packages: sorted,
    totals: sumAmounts(sorted),
    pastCount: states.filter((state) => state === 'PAST').length,
    soonCount: states.filter((state) => state === 'SOON').length,
    nearest: sorted.find((pkg) => pkg.expiresAt !== null) ?? null,
  };
};

/** The in-stock packages of each ingredient, soonest date first. */
export const groupPackagesByIngredient = (packages: Package[]) =>
  packages.reduce((byIngredient, pkg) => {
    if (pkg.status !== 'IN_STOCK') return byIngredient;

    return byIngredient.set(pkg.ingredientId, [
      ...(byIngredient.get(pkg.ingredientId) ?? []),
      pkg,
    ]);
  }, new Map<string, Package[]>());

export const sortGroups = (groups: Map<string, Package[]>) =>
  new Map(
    Array.from(groups, ([id, list]) => [id, [...list].sort(byUseBy)] as const),
  );

/** The one flag an ingredient's row carries: what is past its date, else what is due soon, else the nearest date in plain words; nothing without any date. */
export const getStockFlag = (
  view: StockView,
  now = Date.now(),
  soonDays?: number,
): { state: EatByState; label: string } | null => {
  if (view.pastCount > 0) {
    const label =
      view.packages.length === 1
        ? 'Past its date'
        : `${view.pastCount} past ${view.pastCount === 1 ? 'its' : 'their'} date`;
    return { state: 'PAST', label };
  }
  const { nearest } = view;
  if (nearest === null || nearest.expiresAt === null) return null;

  return {
    state: getEatByState(nearest.expiresAt, now, soonDays),
    label: getEatByLabel(nearest.expiresAt, now, 'Use'),
  };
};

/** "3 packages · 2.4 lb in all": how many, and how much, in the order a row reads them. */
export const getStockSummaryParts = (view: StockView) => {
  const count = view.packages.length;
  const total =
    view.totals.length === 0
      ? null
      : view.totals.map(formatTotal).join(' and ');
  return [
    count > 1 ? `${count} packages` : null,
    total === null ? null : count > 1 ? `${total} in all` : total,
  ].filter((part) => part !== null);
};

export interface PantrySummary {
  packageCount: number;
  ingredientCount: number;
  soonCount: number;
  pastCount: number;
}

export const getPantrySummary = (
  packages: Package[],
  now = Date.now(),
  soonDays?: number,
): PantrySummary => {
  const inStock = packages.filter((pkg) => pkg.status === 'IN_STOCK');
  const states = inStock.map((pkg) =>
    getPackageState(pkg.expiresAt, now, soonDays),
  );
  return {
    packageCount: inStock.length,
    ingredientCount: new Set(inStock.map((pkg) => pkg.ingredientId)).size,
    soonCount: states.filter((state) => state === 'SOON').length,
    pastCount: states.filter((state) => state === 'PAST').length,
  };
};

/** "2 to use soon, 1 past its date": the tile's status in words. */
export const getPantryDueText = (soonCount: number, pastCount: number) =>
  [
    soonCount > 0 && `${soonCount} to use soon`,
    pastCount > 0 &&
      `${pastCount} past ${pastCount === 1 ? 'its' : 'their'} date`,
  ]
    .filter((part) => part !== false)
    .join(', ');

export const getPastDuePackages = (
  packages: Package[],
  now = Date.now(),
): Package[] =>
  packages.filter(
    (pkg) =>
      pkg.status === 'IN_STOCK' &&
      getPackageState(pkg.expiresAt, now) === 'PAST',
  );

export const getPackagesPastDueText = (count: number) =>
  `${count} ${count === 1 ? 'package is' : 'packages are'} past ${count === 1 ? 'its' : 'their'} date`;

export const getPackageTossAction = (count: number) =>
  count === 1 ? 'Toss it' : 'Toss them';

const countPackages = (count: number) =>
  `${count} ${count === 1 ? 'package' : 'packages'}`;

export const getPackageSelectionTitle = (count: number) =>
  count === 0 ? 'Select packages' : `${count} selected`;

export const getPackageSelectionNote = (count: number) =>
  count === 0 ? 'Tap the packages you want to act on.' : null;

export const getPackageTossTitle = (count: number) =>
  `Toss ${countPackages(count)}?`;

export const getPackageTossNote = (count: number) =>
  `${count === 1 ? 'It leaves' : 'They leave'} your pantry. You can undo it right after.`;

const MAX_BULK_NAMES = 3;

export interface PackageNameLine {
  title: string;
  /** What tells it from a row like it: how much, and its date. */
  details: string[];
}

/** The packages a confirm names: soonest date first, three at most, then how many more. */
export const getPackageBulkNames = (
  packages: Package[],
  getName: (pkg: Package) => string,
  now = Date.now(),
) => {
  const sorted = [...packages].sort(byUseBy);
  const lines: PackageNameLine[] = sorted
    .slice(0, MAX_BULK_NAMES)
    .map((pkg) => ({
      title: getName(pkg),
      details: [
        formatSize(pkg.amount, pkg.unit),
        pkg.expiresAt === null
          ? 'No date'
          : `Use by ${formatDayShort(getPlannedDayKey(pkg.expiresAt), now)}`,
      ],
    }));
  return { lines, more: Math.max(0, sorted.length - MAX_BULK_NAMES) };
};

const PACKAGE_FINISHED = 'This one is already finished.';
const PACKAGE_CHANGED = 'That has changed since, so it could not be undone.';

export type PackageFields = Partial<
  Pick<
    Package,
    | 'amount'
    | 'unit'
    | 'place'
    | 'expiresAt'
    | 'productId'
    | 'ingredientName'
    | 'openedAt'
    | 'status'
  >
> &
  Pick<Package, 'history' | 'updatedAt'>;

export type PackagePlan = { fields: PackageFields } | { error: string };

const getDayText = (date: number | null, now: number) =>
  date === null ? 'no date' : formatDayShort(getPlannedDayKey(date), now);

/** What using some or all of it writes. A first use stamps when it was opened; using the last of it finishes it, keeping the amount it ended with. */
export const planUse = (
  pkg: Package,
  amount: number | 'ALL',
  now: number,
): PackagePlan => {
  if (pkg.status !== 'IN_STOCK') return { error: PACKAGE_FINISHED };

  const used = amount === 'ALL' ? pkg.amount : round2(amount);
  if (!isValidPackageAmount(used)) return { error: 'Say how much you used.' };
  if (used > pkg.amount + EPSILON) {
    return {
      error: `Only ${formatSize(pkg.amount, pkg.unit)} is left, so nothing was changed.`,
    };
  }

  const history = appendPackageEvent(
    pkg.history,
    makePackageEvent('USED', now, {
      amount: Math.min(used, pkg.amount),
    }),
  );
  const isLast = used >= pkg.amount - EPSILON;
  return {
    fields: isLast
      ? { status: 'DONE', history, updatedAt: now }
      : {
          amount: round2(pkg.amount - used),
          openedAt: pkg.openedAt ?? now,
          history,
          updatedAt: now,
        },
  };
};

export const planPackageToss = (pkg: Package, now: number): PackagePlan =>
  pkg.status !== 'IN_STOCK'
    ? { error: PACKAGE_FINISHED }
    : {
        fields: {
          status: 'DONE',
          history: appendPackageEvent(
            pkg.history,
            makePackageEvent('TOSSED', now, { amount: pkg.amount }),
          ),
          updatedAt: now,
        },
      };

/** Moving keeps the date the package shows unless a new one is given (`undefined` keeps it, `null` clears it). */
export const planPackageMove = (
  pkg: Package,
  to: PackagePlace,
  expiresAt: number | null | undefined,
  now: number,
): PackagePlan => {
  if (pkg.status !== 'IN_STOCK') return { error: PACKAGE_FINISHED };
  if (pkg.place === to) {
    return {
      error: `It is already in ${getPlaceText(to)}, so nothing was changed.`,
    };
  }
  if (expiresAt !== undefined && !isValidExpiresAt(expiresAt)) {
    return { error: 'Pick a day for the date.' };
  }

  const isRedated = expiresAt !== undefined && expiresAt !== pkg.expiresAt;
  const note = [
    `From ${getPlaceText(pkg.place)}`,
    isRedated &&
      `Use by ${getDayText(pkg.expiresAt, now)} → ${getDayText(expiresAt, now)}`,
  ]
    .filter((part) => part !== false)
    .join(' · ');
  return {
    fields: {
      place: to,
      ...(isRedated ? { expiresAt } : {}),
      history: appendPackageEvent(
        pkg.history,
        makePackageEvent('MOVED', now, { place: to, note }),
      ),
      updatedAt: now,
    },
  };
};

export interface PackageEdit {
  amount?: number;
  unit?: Unit;
  place?: PackagePlace;
  expiresAt?: number | null;
  productId?: string | null;
  ingredientName?: string;
}

/** The fields an edit form owns and what changed, as one entry in the history; a place change is a move of its own. A name or product change alone writes no entry. */
export const planPackageEdit = (
  pkg: Package,
  edit: PackageEdit,
  now: number,
): PackagePlan => {
  if (pkg.status !== 'IN_STOCK') return { error: PACKAGE_FINISHED };

  const amount = edit.amount === undefined ? pkg.amount : round2(edit.amount);
  const unit = edit.unit ?? pkg.unit;
  const expiresAt =
    edit.expiresAt === undefined ? pkg.expiresAt : edit.expiresAt;
  if (!isValidPackageAmount(amount)) return { error: 'Say how much there is.' };
  if (!isValidExpiresAt(expiresAt))
    return { error: 'Pick a day for the date.' };

  const isAmountChanged = amount !== pkg.amount || unit !== pkg.unit;
  const isDateChanged = expiresAt !== pkg.expiresAt;
  const isPlaceChanged = edit.place !== undefined && edit.place !== pkg.place;
  const productId =
    edit.productId === undefined ? pkg.productId : edit.productId;
  const ingredientName = edit.ingredientName?.trim() ?? pkg.ingredientName;
  const isQuiet =
    productId !== pkg.productId || ingredientName !== pkg.ingredientName;
  if (!isAmountChanged && !isDateChanged && !isPlaceChanged && !isQuiet) {
    return { error: 'Nothing was changed.' };
  }

  const notes = [
    isAmountChanged &&
      `Amount ${formatSize(pkg.amount, pkg.unit)} → ${formatSize(amount, unit)}`,
    isDateChanged &&
      `Use by ${getDayText(pkg.expiresAt, now)} → ${getDayText(expiresAt, now)}`,
  ].filter((part) => part !== false);
  const afterEdit =
    notes.length === 0
      ? pkg.history
      : appendPackageEvent(
          pkg.history,
          makePackageEvent('EDITED', now, { note: notes.join(' · ') }),
        );
  const history =
    isPlaceChanged && edit.place !== undefined
      ? appendPackageEvent(
          afterEdit,
          makePackageEvent('MOVED', now, {
            place: edit.place,
            note: `From ${getPlaceText(pkg.place)}`,
          }),
        )
      : afterEdit;
  return {
    fields: {
      ...(amount !== pkg.amount ? { amount } : {}),
      ...(unit !== pkg.unit ? { unit } : {}),
      ...(isDateChanged ? { expiresAt } : {}),
      ...(isPlaceChanged ? { place: edit.place } : {}),
      productId,
      ingredientName,
      history,
      updatedAt: now,
    },
  };
};

const END_KINDS: PackageEventKind[] = ['USED', 'TOSSED'];

/** Takes back a use or a toss only while it is still the last thing that happened to the package, so a later change is never rewound. */
export const planUndoEnd = (
  pkg: Package,
  at: number,
  now: number,
): PackagePlan => {
  const last = pkg.history.at(-1);
  if (
    !last ||
    last.at !== at ||
    !END_KINDS.includes(last.kind) ||
    last.amount === null
  ) {
    return { error: PACKAGE_CHANGED };
  }

  const amount =
    pkg.status === 'DONE' ? pkg.amount : round2(pkg.amount + last.amount);
  if (!isValidPackageAmount(amount)) return { error: PACKAGE_CHANGED };

  return {
    fields: {
      amount,
      status: 'IN_STOCK',
      openedAt: pkg.openedAt === last.at ? null : pkg.openedAt,
      history: pkg.history.slice(0, -1),
      updatedAt: now,
    },
  };
};

export interface PackageBefore {
  place: PackagePlace;
  expiresAt: number | null;
}

/** Puts a moved package back where it was, with the date it had, only while that move is still its last event. */
export const planUndoPackageMove = (
  pkg: Package,
  at: number,
  before: PackageBefore,
  now: number,
): PackagePlan => {
  const last = pkg.history.at(-1);
  if (
    pkg.status !== 'IN_STOCK' ||
    pkg.place === before.place ||
    !last ||
    last.at !== at ||
    last.kind !== 'MOVED'
  ) {
    return { error: PACKAGE_CHANGED };
  }

  return {
    fields: {
      place: before.place,
      expiresAt: before.expiresAt,
      history: pkg.history.slice(0, -1),
      updatedAt: now,
    },
  };
};

export type PackageBulkKind = 'TOSS' | 'USE_UP' | 'MOVE';

export type PackageSkipReason = 'GONE' | 'FINISHED' | 'REDATED' | 'SAME_PLACE';

export type PackageSkipCounts = Record<PackageSkipReason, number>;

export const NO_PACKAGE_SKIPS: PackageSkipCounts = {
  GONE: 0,
  FINISHED: 0,
  REDATED: 0,
  SAME_PLACE: 0,
};

export interface PackageBulkAction {
  kind: PackageBulkKind;
  /** Where a move goes. */
  to?: PackagePlace;
  /** Leaves a package alone once its date is no longer in the past, for acting on what the screen called past its date. */
  isPastOnly?: boolean;
}

export interface PackageBulkWrite {
  id: string;
  fields: PackageFields;
  /** Where a moved package was and its date then, which its Undo puts back; null for any other act. */
  before: PackageBefore | null;
}

const planBulkWrite = (
  pkg: Package,
  action: PackageBulkAction,
  now: number,
): PackagePlan => {
  if (action.kind === 'TOSS') return planPackageToss(pkg, now);
  if (action.kind === 'USE_UP') return planUse(pkg, 'ALL', now);
  return planPackageMove(pkg, action.to ?? pkg.place, undefined, now);
};

const planBulkOne = (
  pkg: Package | null,
  action: PackageBulkAction,
  now: number,
): { write: PackageBulkWrite } | { skip: PackageSkipReason } => {
  if (pkg === null) return { skip: 'GONE' };
  if (pkg.status !== 'IN_STOCK') return { skip: 'FINISHED' };
  if (
    action.isPastOnly === true &&
    getPackageState(pkg.expiresAt, now) !== 'PAST'
  ) {
    return { skip: 'REDATED' };
  }
  if (action.kind === 'MOVE' && pkg.place === action.to) {
    return { skip: 'SAME_PLACE' };
  }

  const plan = planBulkWrite(pkg, action, now);
  if ('error' in plan) return { skip: 'FINISHED' };

  return {
    write: {
      id: pkg.id,
      fields: plan.fields,
      before:
        action.kind === 'MOVE'
          ? { place: pkg.place, expiresAt: pkg.expiresAt }
          : null,
    },
  };
};

/** What a bulk act still writes, one pass over what the transaction just read: a package that is gone, finished, already there, or (for a past-its-date act) re-dated since the tap is left as it is and counted by why. */
export const planPackageBulk = (
  packages: (Package | null)[],
  action: PackageBulkAction,
  now: number,
) => {
  const plans = packages.map((pkg) => planBulkOne(pkg, action, now));
  return {
    writes: plans.flatMap((plan) => ('write' in plan ? [plan.write] : [])),
    skipped: plans.reduce<PackageSkipCounts>(
      (counts, plan) =>
        'skip' in plan
          ? { ...counts, [plan.skip]: counts[plan.skip] + 1 }
          : counts,
      NO_PACKAGE_SKIPS,
    ),
  };
};

const getCountWord = (count: number) => (count === 1 ? 'one' : `${count}`);

/** What a bulk act skipped and why, in a sentence; null when it skipped nothing. */
export const getPackageSkippedText = (skipped: PackageSkipCounts) => {
  const parts = [
    skipped.FINISHED > 0 &&
      `${getCountWord(skipped.FINISHED)} ${skipped.FINISHED === 1 ? 'was' : 'were'} already finished`,
    skipped.SAME_PLACE > 0 &&
      `${getCountWord(skipped.SAME_PLACE)} ${skipped.SAME_PLACE === 1 ? 'was' : 'were'} already there`,
    skipped.REDATED > 0 && `${getCountWord(skipped.REDATED)} got a new date`,
    skipped.GONE > 0 &&
      `${getCountWord(skipped.GONE)} ${skipped.GONE === 1 ? 'was' : 'were'} deleted`,
  ].filter((part) => part !== false);
  if (parts.length === 0) return null;

  const sentence = formatList(parts);
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
};

interface PackageBulkToastInput {
  action: PackageBulkAction;
  requested: number;
  changed: number;
  skipped: PackageSkipCounts;
  names: string | null;
}

/** "Tossed 4 packages", or "Tossed 4 of 5 packages" when some were left alone, with what was left alone or the names under it. */
export const getPackageBulkToast = ({
  action,
  requested,
  changed,
  skipped,
  names,
}: PackageBulkToastInput) => {
  const amount =
    changed === requested
      ? countPackages(changed)
      : `${changed} of ${countPackages(requested)}`;
  const getTitle = () => {
    if (action.kind === 'TOSS') return `Tossed ${amount}`;
    if (action.kind === 'USE_UP') return `Used up ${amount}`;
    return `Moved ${amount} to ${getPlaceText(action.to ?? 'PANTRY')}`;
  };
  const skippedText = getPackageSkippedText(skipped);
  return {
    title: getTitle(),
    description: skippedText ?? names ?? undefined,
  };
};

export const getPackageNamesLine = getNamesLine;

export const getPackageUndoText = (restored: number, total: number) =>
  restored === total
    ? `Put ${countPackages(restored)} back`
    : `Put back ${restored} of ${total}; the rest changed since`;

export interface TakeLine {
  ingredientId: string;
  amount: number;
  unit: Unit;
}

export interface PackageTake {
  packageId: string;
  ingredientId: string;
  /** In the package's own unit. */
  amount: number;
  unit: Unit;
  /** The take empties the package. */
  isAll: boolean;
  /** The recipe measures it another way than the package does, so the amount went through the ingredient's own weight per cup or per piece. */
  isConverted: boolean;
}

export interface TakeShortfall {
  ingredientId: string;
  amount: number;
  unit: Unit;
}

export interface TakePlan {
  takes: PackageTake[];
  /** What the packages couldn't cover, in the unit of the largest line. */
  short: TakeShortfall[];
}

export interface TakeGroup {
  ingredientId: string;
  name: string;
  packageCount: number;
  /** What comes out, per kind of unit, in each package's own unit. */
  totals: AmountTotal[];
  isConverted: boolean;
  /** What the packages couldn't cover, if anything. */
  short: TakeShortfall | null;
}

/** A plan's takes as one entry per ingredient, in the order the plan drew them. */
export const getTakeGroups = (
  plan: TakePlan,
  getName: (ingredientId: string) => string,
): TakeGroup[] =>
  Array.from(
    plan.takes
      .reduce(
        (byIngredient, take) =>
          byIngredient.set(take.ingredientId, [
            ...(byIngredient.get(take.ingredientId) ?? []),
            take,
          ]),
        new Map<string, PackageTake[]>(),
      )
      .entries(),
    ([ingredientId, takes]) => ({
      ingredientId,
      name: getName(ingredientId),
      packageCount: takes.length,
      totals: sumAmounts(takes),
      isConverted: takes.some((take) => take.isConverted),
      short:
        plan.short.find((entry) => entry.ingredientId === ingredientId) ?? null,
    }),
  );

/** "2 cup", "about 0.42 lb", "1 cup and 1.25 lb". */
export const getTakeAmountText = (group: TakeGroup) =>
  group.totals
    .map((total, index) =>
      formatKitchenTotal(total, group.isConverted && index === 0),
    )
    .join(' and ');

/** What was taken, in one line: "Took 2 cup rice from 1 package", or a count when it was several things. */
export const getTakenHeadline = (groups: TakeGroup[]) => {
  if (groups.length !== 1) {
    return `Took ${groups.length} things out of your pantry`;
  }

  const [group] = groups;
  return `Took ${getTakeAmountText(group)} ${group.name.toLowerCase()} from ${countPackages(group.packageCount)}`;
};

/** What turns a weight into a volume or a count for one ingredient: its own numbers, or none. */
export type GetConversions = (ingredientId: string) => Conversions;

const NO_CONVERSIONS: GetConversions = () => ({
  gramsPerMl: null,
  gramsEach: null,
});

interface CommonQuantity {
  key: Dimension;
  base: number;
}

/** An amount as something comparable: grams when the ingredient's own numbers can bridge it to a weight (a cup of rice and a pound of rice meet there), else its own kind in its base unit. Nothing is converted without those numbers. */
const toCommon = (
  amount: number,
  unit: Unit,
  conversions: Conversions,
): CommonQuantity => {
  const base = toBase(amount, unit);
  const mass = bridge(base, 'MASS', conversions);
  return mass === null
    ? { key: base.dimension, base: base.value }
    : { key: 'MASS', base: mass.value };
};

/** A common amount back in a unit of any kind, null when the numbers to get there are missing. */
const fromCommon = (
  quantity: CommonQuantity,
  unit: Unit,
  conversions: Conversions,
): number | null => {
  const target = UNIT_DIMENSION[unit];
  const bridged = bridge(
    { dimension: quantity.key, value: quantity.base },
    target,
    conversions,
  );
  return bridged === null ? null : bridged.value / UNIT_TO_BASE[unit];
};

/** What cooking takes out of the pantry: each ingredient's lines added up in a common measure, then drawn from its packages, soonest date first, past-date ones left alone. A package that can't cover the rest gives what it has, and the shortfall is reported; an ingredient with nothing it can be compared with takes nothing, and neither does a line with no amount. */
export const planTakeOut = (
  lines: TakeLine[],
  packages: Package[],
  now = Date.now(),
  getConversions: GetConversions = NO_CONVERSIONS,
): TakePlan => {
  const needs = Array.from(
    lines
      .reduce((byKey, line) => {
        const common = toCommon(
          line.amount,
          line.unit,
          getConversions(line.ingredientId),
        );
        const key = `${line.ingredientId}::${common.key}`;
        return byKey.set(key, [...(byKey.get(key) ?? []), { line, common }]);
      }, new Map<string, { line: TakeLine; common: CommonQuantity }[]>())
      .values(),
  ).map((group) => {
    const lead = group.reduce((best, entry) =>
      entry.common.base > best.common.base ? entry : best,
    );
    return {
      ingredientId: lead.line.ingredientId,
      key: lead.common.key,
      leadUnit: lead.line.unit,
      units: group.map((entry) => entry.line.unit),
      base: group.reduce((sum, entry) => sum + entry.common.base, 0),
    };
  });

  const results = needs.map((need) => {
    const conversions = getConversions(need.ingredientId);
    const tolerance = Math.max(need.base * 0.002, 1e-6);
    const candidates = packages
      .filter(
        (pkg) =>
          pkg.status === 'IN_STOCK' &&
          pkg.ingredientId === need.ingredientId &&
          getPackageState(pkg.expiresAt, now) !== 'PAST' &&
          toCommon(pkg.amount, pkg.unit, conversions).key === need.key,
      )
      .sort(byUseBy);
    const drawn = candidates.reduce(
      (state, pkg) => {
        if (state.left <= tolerance) return state;

        const available = toCommon(pkg.amount, pkg.unit, conversions).base;
        const isAll = state.left >= available - tolerance;
        const wanted = fromCommon(
          { key: need.key, base: state.left },
          pkg.unit,
          conversions,
        );
        const amount = isAll
          ? pkg.amount
          : Math.min(pkg.amount, round2(wanted ?? 0));
        if (amount <= 0) return state;

        return {
          left: Math.max(
            0,
            state.left - toCommon(amount, pkg.unit, conversions).base,
          ),
          takes: [
            ...state.takes,
            {
              packageId: pkg.id,
              ingredientId: pkg.ingredientId,
              amount,
              unit: pkg.unit,
              isAll: isAll || amount >= pkg.amount - EPSILON,
              isConverted: need.units.some(
                (unit) => UNIT_DIMENSION[unit] !== UNIT_DIMENSION[pkg.unit],
              ),
            },
          ],
        };
      },
      { left: need.base, takes: [] as PackageTake[] },
    );
    const leftInLead = fromCommon(
      { key: need.key, base: drawn.left },
      need.leadUnit,
      conversions,
    );
    const isShort =
      candidates.length > 0 &&
      drawn.left > tolerance &&
      leftInLead !== null &&
      round2(leftInLead) > 0;
    return {
      takes: drawn.takes,
      short:
        isShort && leftInLead !== null
          ? [
              {
                ingredientId: need.ingredientId,
                amount: round2(leftInLead),
                unit: need.leadUnit,
              },
            ]
          : [],
    };
  });

  return {
    takes: results.flatMap((result) => result.takes),
    short: results.flatMap((result) => result.short),
  };
};

export type LineStock =
  | { kind: 'NONE' }
  | { kind: 'PAST' }
  | { kind: 'OTHER' }
  | {
      kind: 'SOME';
      have: Pick<AmountTotal, 'amount' | 'unit'>;
      isConverted: boolean;
    }
  | {
      kind: 'HAVE';
      have: Pick<AmountTotal, 'amount' | 'unit'> | null;
      isConverted: boolean;
    };

/** How a recipe line stands against the pantry. What counts is in-stock packages not past their date, measured in the line's own kind of unit or, where the ingredient's own weight per cup or per piece bridges them, in grams. With nothing to bridge, an amount of another kind can't prove there is enough, and a line with no amount ("to taste") is met by having any. */
export const getLineStock = (
  line: { ingredientId?: string; amount: number | null; unit: Unit },
  packages: Package[] | undefined,
  now = Date.now(),
  conversions: Conversions = { gramsPerMl: null, gramsEach: null },
): LineStock => {
  const inStock = (packages ?? []).filter((pkg) => pkg.status === 'IN_STOCK');
  if (inStock.length === 0) return { kind: 'NONE' };

  const usable = inStock.filter(
    (pkg) => getPackageState(pkg.expiresAt, now) !== 'PAST',
  );
  if (usable.length === 0) return { kind: 'PAST' };
  if (line.amount === null) {
    return { kind: 'HAVE', have: null, isConverted: false };
  }

  const need = toCommon(line.amount, line.unit, conversions);
  const matching = usable.filter(
    (pkg) => toCommon(pkg.amount, pkg.unit, conversions).key === need.key,
  );
  if (matching.length === 0) return { kind: 'OTHER' };

  const haveBase = matching.reduce(
    (sum, pkg) => sum + toCommon(pkg.amount, pkg.unit, conversions).base,
    0,
  );
  const inLine = fromCommon(
    { key: need.key, base: haveBase },
    line.unit,
    conversions,
  );
  const have = { amount: round2(inLine ?? 0), unit: line.unit };
  const isConverted = matching.some(
    (pkg) => UNIT_DIMENSION[pkg.unit] !== UNIT_DIMENSION[line.unit],
  );
  return haveBase >= need.base * 0.99
    ? { kind: 'HAVE', have, isConverted }
    : { kind: 'SOME', have, isConverted };
};

/** The quiet words a recipe line or a shopping row carries about the pantry. */
export const getLineStockText = (stock: LineStock) => {
  switch (stock.kind) {
    case 'HAVE':
      return 'You have it';
    case 'SOME':
      return `You have ${formatKitchenTotal(stock.have, stock.isConverted)}`;
    case 'OTHER':
      return 'In your pantry';
    case 'PAST':
      return 'Past its date';
    default:
      return 'Not in your pantry';
  }
};

export interface LineMarkers {
  /** The words a line carries, by line id; a line with nothing to say is null. */
  byId: Map<string, string | null>;
  /** Said once beside the list: how many lines the pantry has, or null when it has none of them. */
  summary: string | null;
}

/** The marks for a recipe's lines, saying only the exception: a line past its date always, and then whichever of "in your pantry" and "not in your pantry" is the minority, so a list the pantry mostly covers flags what is missing and a list it hardly touches flags what is there. The share is said once as the summary. */
export const getLineMarkers = (
  entries: { id: string; stock: LineStock }[],
): LineMarkers => {
  const isPresent = (stock: LineStock) =>
    stock.kind === 'HAVE' || stock.kind === 'SOME' || stock.kind === 'OTHER';
  const present = entries.filter((entry) => isPresent(entry.stock)).length;
  const absent = entries.filter((entry) => entry.stock.kind === 'NONE').length;
  const flagsAbsent = present >= absent;
  const getText = (stock: LineStock) => {
    if (stock.kind === 'PAST') return getLineStockText(stock);
    if (flagsAbsent)
      return stock.kind === 'NONE' ? getLineStockText(stock) : null;
    return isPresent(stock) ? getLineStockText(stock) : null;
  };
  return {
    byId: new Map(entries.map((entry) => [entry.id, getText(entry.stock)])),
    summary:
      present === 0 ? null : `${present} of ${entries.length} in your pantry`,
  };
};

export const getPackageEventText = (event: PackageEvent, unit: Unit) => {
  const amount = event.amount === null ? '' : formatSize(event.amount, unit);
  const where = event.place === null ? '' : getPlaceText(event.place);
  switch (event.kind) {
    case 'ADDED':
      return where === '' ? 'Added' : `Added to ${where}`;
    case 'USED':
      return amount === '' ? 'Used some' : `Used ${amount}`;
    case 'MOVED':
      return where === '' ? 'Moved' : `Moved to ${where}`;
    case 'TOSSED':
      return amount === '' ? 'Tossed' : `Tossed ${amount}`;
    default:
      return event.note ?? 'Changed';
  }
};

/** How long ago it was opened, in whole days; null for one that is unopened. */
export const getOpenedDays = (
  pkg: Pick<Package, 'openedAt'>,
  now = Date.now(),
) =>
  pkg.openedAt === null
    ? null
    : Math.max(
        0,
        Math.round(
          (getLocalTodayDate(now) - getLocalTodayDate(pkg.openedAt)) / DAY_MS,
        ),
      );

const MAX_USE_IT_UP_RECIPES = 20;

export interface UseItUpRecipe {
  id: string;
  title: string;
  /** The names of the recipe's other ingredients that are also due, soonest first. */
  dueNames: string[];
}

/** The person's own recipes that use an ingredient, the ones that also use something due soon or sooner first: ranked by the earliest date among what the recipe would use up, then by how many of those it takes care of. Nothing is written; this only orders a list. */
export const getUseItUpRecipes = (
  recipes: Pick<Recipe, 'id' | 'title' | 'ingredients' | 'isArchived'>[],
  byIngredient: Map<string, Package[]>,
  ingredientId: string,
  getName: (ingredientId: string) => string,
  now = Date.now(),
  soonDays?: number,
): UseItUpRecipe[] => {
  const getDue = (id: string) =>
    (byIngredient.get(id) ?? [])
      .filter(
        (pkg) =>
          pkg.status === 'IN_STOCK' &&
          pkg.expiresAt !== null &&
          getPackageState(pkg.expiresAt, now, soonDays) === 'SOON',
      )
      .sort(byUseBy)[0];

  return recipes
    .filter(
      (recipe) =>
        recipe.isArchived !== true &&
        recipe.ingredients.some((line) => line.ingredientId === ingredientId),
    )
    .map((recipe) => {
      const dueIds = Array.from(
        new Set(recipe.ingredients.map((line) => line.ingredientId)),
      )
        .filter((id) => id !== ingredientId && getDue(id) !== undefined)
        .sort(
          (a, b) =>
            (getDue(a)?.expiresAt ?? 0) - (getDue(b)?.expiresAt ?? 0) ||
            a.localeCompare(b),
        );
      const dates = [ingredientId, ...dueIds].flatMap((id) => {
        const due = getDue(id);
        return due?.expiresAt == null ? [] : [due.expiresAt];
      });
      return {
        id: recipe.id,
        title: recipe.title,
        dueNames: dueIds.map(getName),
        soonest: dates.length === 0 ? Infinity : Math.min(...dates),
      };
    })
    .sort(
      (a, b) =>
        (a.soonest === b.soonest ? 0 : a.soonest < b.soonest ? -1 : 1) ||
        b.dueNames.length - a.dueNames.length ||
        a.title.localeCompare(b.title),
    )
    .slice(0, MAX_USE_IT_UP_RECIPES)
    .map(({ id, title, dueNames }) => ({ id, title, dueNames }));
};

/** "Also uses spinach and cilantro", names at most two, then "and N more". */
export const getUseItUpText = (dueNames: string[]) => {
  if (dueNames.length === 0) return null;

  const shown = dueNames.slice(0, 2).map((name) => name.toLowerCase());
  const rest = dueNames.length - shown.length;
  return `Also uses ${rest > 0 ? `${shown.join(', ')} and ${rest} more` : formatList(shown)}`;
};
