import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Search } from 'lucide-react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AmountHero from '@/components/AmountHero';
import FallbackImage from '@/components/FallbackImage';
import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import QuestionFlow from '@/components/QuestionFlow';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import LinkPreviewCard from '@/components/LinkPreviewCard';
import RevealChip from '@/components/RevealChip';
import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import OptionalDetailRows, {
  type OptionalDetail,
} from '@/components/forms/OptionalDetailRows';
import SearchInput from '@/components/SearchInput';
import SummaryRow from '@/components/SummaryRow';
import { useAuth } from '@/hooks/useAuth';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import {
  useQuestionFlow,
  type QuestionControls,
  type QuestionStep,
} from '@/hooks/useQuestionFlow';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents, parseMoneyToCents } from '@/utils/moneyUtils';
import { generateUuid } from '@/utils/idUtils';
import { getWebLinkHost, toWebLink } from '@/utils/urlUtils';
import { useAppSelector } from '@/store';
import ReceiptFileInput, {
  type ReceiptChooser,
} from '@apps/runway/components/ReceiptFileInput';
import { pickReceiptFiles } from '@apps/runway/utils/receiptFiles';
import { addReceiptImages } from '@apps/runway/store/actions/receiptActions';
import ItemBadge from '@apps/runway/components/ItemBadge';
import SplitEditor from '@apps/runway/components/SplitEditor';
import { isTooLong } from '@apps/runway/utils/rangeInput';
import {
  CARD_WORDS,
  FORM_FLOW_WORDS,
  MAX_LINK_LENGTH,
  MAX_RECEIPTS_PER_PURCHASE,
  MAX_NOTE_LENGTH,
  MAX_PURCHASE_CENTS,
  RUNWAY_SEARCH_THRESHOLD,
  MAX_NAME_LENGTH,
  SPEND_WORDS,
} from '@apps/runway/constants';
import { getUsualCardId } from '@apps/runway/engine/cards';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  getCountedFrom,
  getPurchaseEffect,
  getRefundableCents,
  getRefundLines,
  isInTrackingPeriods,
  splitEvenly,
  toChosenLines,
} from '@apps/runway/engine/purchases';
import { linkPageQueryOptions } from '@apps/runway/queries/linkPageQueries';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  addPurchase,
  editPurchase,
} from '@apps/runway/store/actions/purchaseActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectAllCards,
  selectCards,
  selectEnvelopes,
  selectExpenses,
  selectItemLooks,
  selectSpendPurchases,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase, PurchaseLine } from '@apps/runway/types';
import {
  describeEnvelopes,
  describePurchaseEdit,
  getPurchaseTitle,
} from '@apps/runway/utils/purchaseText';
import { getCardName } from '@apps/runway/utils/cardText';
import { maskSummaries } from '@apps/runway/utils/maskSummaries';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { MaskedText } from '@apps/runway/components/MaskedText';
import SensitiveValue from '@/components/SensitiveValue';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import PurchaseEffectNotice, {
  CardChargeNotice,
} from '@apps/runway/components/PurchaseEffectNotice';
import ValuesEyeButton from '@/components/ValuesEyeButton';

const ORIGIN_PAGE = 20;
const MOST_USED_SHOWN = 5;
const RECENT_PURCHASES = 60;
const FREE_VALUE = 'free';
const CASH_VALUE = 'cash';

const USUAL_NOTE_KEY = 'runway.usualCardNotes';
const USUAL_NOTE_TIMES = 3;

const readUsualNotesSeen = () => {
  try {
    return Number(localStorage.getItem(USUAL_NOTE_KEY)) || 0;
  } catch {
    return 0;
  }
};

const countUsualNote = (seen: number) => {
  try {
    localStorage.setItem(USUAL_NOTE_KEY, String(seen + 1));
  } catch {
    // A private window keeps no count; the note simply shows again.
  }
};

type TextExtraKey = 'label' | 'merchant' | 'note' | 'link' | 'group';
type ExtraKey = TextExtraKey | 'receipt';

interface PickedReceipt {
  file: File;
  url: string;
}

const EXTRAS: {
  key: TextExtraKey;
  words: { name: string; placeholder: string; add: string };
  maxLength: number;
}[] = [
  {
    key: 'label',
    words: {
      name: SPEND_WORDS.label,
      placeholder: SPEND_WORDS.labelPlaceholder,
      add: SPEND_WORDS.addLabel,
    },
    maxLength: MAX_NAME_LENGTH,
  },
  {
    key: 'merchant',
    words: {
      name: SPEND_WORDS.merchant,
      placeholder: SPEND_WORDS.merchantPlaceholder,
      add: SPEND_WORDS.addMerchant,
    },
    maxLength: MAX_NAME_LENGTH,
  },
  {
    key: 'note',
    words: {
      name: SPEND_WORDS.note,
      placeholder: SPEND_WORDS.notePlaceholder,
      add: SPEND_WORDS.addNote,
    },
    maxLength: MAX_NOTE_LENGTH,
  },
  {
    key: 'link',
    words: {
      name: SPEND_WORDS.link,
      placeholder: SPEND_WORDS.linkPlaceholder,
      add: SPEND_WORDS.addLink,
    },
    maxLength: MAX_LINK_LENGTH,
  },
  {
    key: 'group',
    words: {
      name: SPEND_WORDS.group,
      placeholder: SPEND_WORDS.groupPlaceholder,
      add: SPEND_WORDS.addGroup,
    },
    maxLength: MAX_NAME_LENGTH,
  },
];

interface PurchaseFormData {
  amount: string;
  date: string;
  extras: {
    merchant: string | null;
    label: string | null;
    note: string | null;
    link: string | null;
    /** An existing group's id, `NEW_CHOICE` while naming a new one, or '' before one is picked; null while no group is added. */
    group: string | null;
    groupName: string;
  };
}

interface PurchaseFormProps {
  isOpen: boolean;
  onClose: () => void;
  /** Where Cancel and Discard go, when that is not where a save goes (back to the sheet the form came from). */
  onCancel?: () => void;
  /** The envelope the form opened from; it starts chosen. */
  presetEnvelopeId?: string | null;
  /** The purchase being changed; the form then saves over it instead of adding. */
  editing?: OpenPurchase;
}

const toHttpsLink = (text: string) => {
  const link = text.trim() === '' ? null : toWebLink(text);
  return link?.startsWith('https://') ? link : null;
};

const isOfflineFailure = (error: unknown) =>
  !navigator.onLine ||
  /offline|unavailable/i.test(error instanceof Error ? error.message : '');

/** Adds what was spent, or changes a purchase already added: an amount, the envelope it came out of (or several), the day, and a refund when money came back. Needs a connection, since the plan is read fresh as it saves. */
function PurchaseForm({
  isOpen,
  onClose,
  onCancel,
  presetEnvelopeId = null,
  editing,
}: PurchaseFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isMounted = useRef(true);
  const today = todayAsUtcDate();
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const balances = useAppSelector(selectBalances);
  const purchases = useAppSelector(selectSpendPurchases);
  const looks = useAppSelector(selectItemLooks);
  const cards = useAppSelector(selectCards);
  const allCards = useAppSelector(selectAllCards);
  const expenses = useAppSelector(selectExpenses);
  const periods = useAppSelector(
    (state) => state.runway.plan?.trackingPeriods ?? [],
  );

  const [initialData] = useState<PurchaseFormData>(() => ({
    amount: editing ? (Math.abs(editing.amountCents) / 100).toFixed(2) : '',
    date: toDateInputValue(editing ? editing.date : todayAsUtcDate()),
    extras: {
      merchant: editing?.merchant ?? null,
      label: editing?.label ?? null,
      note: editing?.note ?? null,
      link: editing?.link ?? null,
      group: editing?.expenseId ?? null,
      groupName: '',
    },
  }));
  const editingLines = editing?.lines ?? [];
  const startsSplit =
    editing !== undefined && editing.amountCents > 0 && editingLines.length > 1;
  const [formData, setFormData] = useState<PurchaseFormData>(initialData);
  const [view, setView] = useState<'form' | 'split' | 'original' | 'envelopes'>(
    'form',
  );
  const [envelopeSearch, setEnvelopeSearch] = useState('');
  const [isRefund, setIsRefund] = useState(
    editing !== undefined && editing.amountCents < 0,
  );
  const [isSplit, setIsSplit] = useState(startsSplit);
  const [envelopeId, setEnvelopeId] = useState<string | null>(
    editing && !startsSplit && editing.amountCents > 0
      ? (editingLines[0]?.envelopeId ?? null)
      : presetEnvelopeId,
  );
  const [splitIds, setSplitIds] = useState<string[]>(() =>
    startsSplit
      ? editingLines.flatMap((line) =>
          line.envelopeId === null ? [] : [line.envelopeId],
        )
      : [],
  );
  const [shares, setShares] = useState<Record<string, string>>(() =>
    startsSplit
      ? Object.fromEntries(
          editingLines.flatMap((line) =>
            line.envelopeId === null
              ? []
              : [[line.envelopeId, (line.cents / 100).toFixed(2)]],
          ),
        )
      : {},
  );
  const [originalId, setOriginalId] = useState<string | null>(
    editing?.refundOfId ?? null,
  );
  const [returnTo, setReturnTo] = useState<string>(
    editing && editing.amountCents < 0
      ? (editingLines[0]?.envelopeId ?? FREE_VALUE)
      : FREE_VALUE,
  );
  const [paidByChoice, setPaidByChoice] = useState<string | null | undefined>(
    editing ? (editing.paidByCardId ?? null) : undefined,
  );
  const [usualNotesSeen] = useState(readUsualNotesSeen);
  const [originQuery, setOriginQuery] = useState('');
  const [openExtra, setOpenExtra] = useState<ExtraKey | null>(null);
  const [pickedReceipts, setPickedReceipts] = useState<PickedReceipt[] | null>(
    null,
  );
  const [receiptNote, setReceiptNote] = useState<string | null>(null);
  const receiptChooser = useRef<ReceiptChooser>(null);
  const receiptUrls = useRef(new Set<string>());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isMounted.current = true;
    const urls = receiptUrls.current;
    return () => {
      isMounted.current = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const dropReceipts = (dropped: PickedReceipt[]) => {
    dropped.forEach(({ url }) => {
      URL.revokeObjectURL(url);
      receiptUrls.current.delete(url);
    });
  };

  const addReceiptFiles = (files: File[]) => {
    const picked = pickReceiptFiles(files, pickedReceipts?.length ?? 0);
    const added = picked.files.map((file) => {
      const url = URL.createObjectURL(file);
      receiptUrls.current.add(url);
      return { file, url };
    });
    setReceiptNote(picked.note);
    setPickedReceipts((current) => [...(current ?? []), ...added]);
  };

  const countedFrom = getCountedFrom(periods);
  const isEditingCounted =
    editing !== undefined &&
    countedFrom !== null &&
    editing.date >= countedFrom;
  const ownCents = (id: string) =>
    !isEditingCounted
      ? 0
      : editingLines.reduce(
          (sum, line) => (line.envelopeId === id ? sum + line.cents : sum),
          0,
        );
  const liveOptions = envelopes.map(({ item, version }) => ({
    id: item.id,
    name: version.payload.name,
    emoji: version.payload.emoji,
    leftCents: (balances.assignedByItem[item.id] ?? 0) + ownCents(item.id),
  }));
  const keptOptions = [
    ...new Set(
      editingLines.flatMap((line) =>
        line.envelopeId === null ? [] : [line.envelopeId],
      ),
    ),
  ]
    .filter((id) => !liveOptions.some((option) => option.id === id))
    .map((id) => ({
      id,
      name: looks.get(id)?.name ?? 'An envelope',
      emoji: looks.get(id)?.emoji ?? null,
      leftCents: ownCents(id),
    }));
  const options = [...liveOptions, ...keptOptions];
  const others = purchases.filter((purchase) => purchase.id !== editing?.id);
  const refundedCents = editing
    ? others
        .filter((purchase) => purchase.refundOfId === editing.id)
        .reduce((sum, purchase) => sum - purchase.amountCents, 0)
    : 0;
  const liveIds = new Set(options.map((option) => option.id));
  const leftById = Object.fromEntries(
    options.map((option) => [option.id, option.leftCents]),
  );
  const nameOf = (id: string) => looks.get(id)?.name ?? 'An envelope';

  const parsed = parseMoneyToCents(formData.amount);
  const amount =
    parsed !== null && parsed > 0 && parsed <= MAX_PURCHASE_CENTS
      ? parsed
      : null;
  const date = fromDateInputValue(formData.date) ?? null;
  const original =
    originalId === null
      ? null
      : (others.find((purchase) => purchase.id === originalId) ?? null);
  const refundable =
    original === null ? null : getRefundableCents(original, others);
  const usualCardId =
    editing || isRefund || envelopeId === null || isSplit
      ? undefined
      : getUsualCardId(
          envelopeId,
          purchases,
          cards.map((card) => card.id),
        );
  const isUsualCard = paidByChoice === undefined && usualCardId !== undefined;
  const paidByCardId =
    paidByChoice !== undefined ? paidByChoice : (usualCardId ?? null);
  const cardId =
    isRefund && original !== null
      ? (original.paidByCardId ?? null)
      : paidByCardId;
  const nameOfCard = (id: string | null) => {
    const found = allCards.find((card) => card.id === id);
    return found ? getCardName(found, allCards) : CARD_WORDS.cashOrDebit;
  };
  const nameOfGroup = (id: string | null) =>
    expenses.find((expense) => expense.id === id)?.name ?? SPEND_WORDS.noGroup;
  const cardOptions = allCards.filter(
    (card) => card.archivedAt === null || card.id === paidByCardId,
  );
  const refundedBy = others
    .filter((purchase) => editing && purchase.refundOfId === editing.id)
    .flatMap((purchase) => purchase.lines)
    .reduce<Record<string, number>>((acc, line) => {
      const key = line.envelopeId ?? FREE_VALUE;
      return { ...acc, [key]: (acc[key] ?? 0) - line.cents };
    }, {});
  const centsAt = (set: readonly PurchaseLine[], key: string) =>
    set
      .filter((line) => (line.envelopeId ?? FREE_VALUE) === key)
      .reduce((sum, line) => sum + line.cents, 0);
  const returnsToOriginal =
    isRefund &&
    original !== null &&
    getRefundLines(original.amountCents, original, (id) => liveIds.has(id))
      .kind === 'lines';

  const getLines = (): PurchaseLine[] | null => {
    if (amount === null) return null;
    if (isRefund) {
      const keepsStored =
        editing !== undefined &&
        amount === -editing.amountCents &&
        originalId === editing.refundOfId &&
        (returnsToOriginal ||
          returnTo === (editingLines[0]?.envelopeId ?? FREE_VALUE));
      if (keepsStored) return editingLines;
      if (original !== null && returnsToOriginal) {
        const result = getRefundLines(
          amount,
          original,
          (id) => liveIds.has(id),
          others,
        );
        return result.kind === 'lines' ? result.lines : null;
      }
      const target = returnTo === FREE_VALUE ? null : returnTo;
      if (target !== null && !liveIds.has(target)) return null;
      return toChosenLines([{ envelopeId: target, cents: -amount }]);
    }
    if (isSplit) {
      const parts = splitIds.map((id) => ({
        envelopeId: id,
        cents: parseMoneyToCents(shares[id] ?? ''),
      }));
      const isValid =
        parts.length >= 2 &&
        parts.every((part) => part.cents !== null && part.cents > 0);
      const total = parts.reduce((sum, part) => sum + (part.cents ?? 0), 0);
      if (!isValid || total !== amount) return null;
      return toChosenLines(
        parts.map((part) => ({
          envelopeId: part.envelopeId,
          cents: part.cents ?? 0,
        })),
      );
    }
    if (envelopeId === null || !liveIds.has(envelopeId)) return null;
    return toChosenLines([{ envelopeId, cents: amount }]);
  };
  const lines = getLines();

  const linkText = formData.extras.link?.trim() ?? '';
  const linkPreview = useLinkPreview(linkText, {
    getQueryOptions: linkPageQueryOptions,
  });

  const getBlocker = () => {
    if (amount === null) return SPEND_WORDS.needsAmount;
    if (isRefund && refundable !== null && amount > refundable) {
      return refundable === 0
        ? 'That purchase has been refunded in full.'
        : `Only ${formatCents(refundable)} of that purchase can still be refunded.`;
    }
    if (!isRefund && refundedCents > amount) return SPEND_WORDS.belowRefunds;
    if (lines === null) {
      if (isSplit && !isRefund) return SPEND_WORDS.needsShares;
      return SPEND_WORDS.needsEnvelope;
    }
    const shortKey = isRefund
      ? undefined
      : Object.keys(refundedBy).find(
          (key) =>
            centsAt(lines, key) <
            Math.min(refundedBy[key], centsAt(editingLines, key)),
        );
    if (shortKey !== undefined) {
      return `${shortKey === FREE_VALUE ? SPEND_WORDS.freeToSpend : nameOf(shortKey)} already got back more than that from refunds.`;
    }
    if (date === null || date > today) return SPEND_WORDS.needsDay;
    if (!isInTrackingPeriods(periods, date)) {
      return `Tracking was not on for ${formatDateUTC(date)}.`;
    }
    if (countedFrom !== null && date < countedFrom && date !== editing?.date) {
      return `Tracking started again on ${formatDateUTC(countedFrom)}. Pick that day or later.`;
    }
    if (linkText !== '' && toHttpsLink(linkText) === null) {
      return SPEND_WORDS.needsWebLink;
    }
    return null;
  };
  const blocker = getBlocker();

  const snapshot = JSON.stringify({
    formData,
    envelopeId,
    isRefund,
    splitIds,
    shares,
    originalId,
    returnTo,
    paidByCardId,
  });
  const [startSnapshot] = useState(snapshot);
  const isCounted =
    date !== null && countedFrom !== null && date >= countedFrom;
  const effect =
    lines === null || !isCounted ? null : getPurchaseEffect(lines, leftById);
  const { isHidden } = useValuesHidden();
  const getEffect = () => {
    if (effect === null || lines === null) return null;
    if (editing !== undefined && snapshot === startSnapshot) return null;
    const own = isEditingCounted ? editingLines : [];
    const ids = [
      ...new Set(
        [...lines, ...own].flatMap((line) =>
          line.envelopeId === null ? [] : [line.envelopeId],
        ),
      ),
    ];
    const changes = ids
      .map((id) => ({
        id,
        name: nameOf(id),
        beforeCents: (leftById[id] ?? 0) - centsAt(own, id),
        afterCents: (leftById[id] ?? 0) - centsAt(lines, id),
      }))
      .filter((change) => change.beforeCents !== change.afterCents);
    const freeDropCents =
      effect.freeDropCents - getPurchaseEffect(own, leftById).freeDropCents;
    return { changes, freeDropCents };
  };
  const preview = getEffect();

  const startSplit = () => {
    const first = envelopeId !== null ? [envelopeId] : [];
    setSplitIds(first);
    setShares(
      first.length === 1 && amount !== null
        ? { [first[0]]: formData.amount }
        : {},
    );
    setIsSplit(true);
    setView('split');
  };

  const stopSplit = () => {
    setEnvelopeId(splitIds[0] ?? envelopeId);
    setIsSplit(false);
  };

  const leaveSplit = () => {
    if (splitIds.length < 2) stopSplit();
    setView('form');
  };

  const toggleRefund = () => {
    if (!isRefund)
      setReturnTo((isSplit ? splitIds[0] : envelopeId) ?? FREE_VALUE);
    else if (returnTo !== FREE_VALUE) setEnvelopeId(returnTo);
    setIsRefund((current) => !current);
    setIsSplit(false);
    setOriginalId(null);
  };

  const evenShares = () => {
    if (amount === null) return;
    const ids = [...splitIds].sort();
    const even = splitEvenly(amount, ids);
    setShares(
      Object.fromEntries(
        ids.map((id, index) => [id, (even[index] / 100).toFixed(2)]),
      ),
    );
  };

  const getGroupChoice = () => {
    const { group, groupName } = formData.extras;
    if (group !== NEW_CHOICE) {
      return { expenseId: group || null, newExpenseName: null };
    }
    const name = groupName.trim();
    if (name === '') return { expenseId: null, newExpenseName: null };
    const same = expenses.find(
      (expense) => expense.name.toLowerCase() === name.toLowerCase(),
    );
    return same
      ? { expenseId: same.id, newExpenseName: null }
      : { expenseId: generateUuid(), newExpenseName: name };
  };

  const handleSave = async () => {
    if (!user || blocker !== null || lines === null || amount === null) return;
    if (date === null) return;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const merchant = formData.extras.merchant?.trim() || null;
      const label = formData.extras.label?.trim() || null;
      const note = formData.extras.note?.trim() || null;
      const receiptFiles = pickedReceipts?.map(({ file }) => file) ?? [];
      const finishReceipts = async (
        purchaseId: string,
        savedTitle: string | null,
      ) => {
        const failed =
          receiptFiles.length === 0
            ? 0
            : await addReceiptImages(
                user.uid,
                encryption,
                purchaseId,
                receiptFiles,
              );
        if (failed > 0) {
          addToast({ title: SPEND_WORDS.receiptLeftBehind, type: 'warning' });
        } else if (savedTitle !== null) {
          addToast({ title: savedTitle, type: 'success' });
        }
      };
      const input = {
        link: toHttpsLink(linkText),
        ...getGroupChoice(),
        date,
        amountCents: isRefund ? -amount : amount,
        merchant,
        label,
        note,
        lines,
        refundOfId: isRefund ? originalId : null,
        paidByCardId: cardId,
      };
      if (editing) {
        const isUnchanged =
          input.date === editing.date &&
          input.amountCents === editing.amountCents &&
          input.merchant === (editing.merchant?.trim() || null) &&
          input.label === (editing.label?.trim() || null) &&
          input.note === (editing.note?.trim() || null) &&
          input.refundOfId === editing.refundOfId &&
          input.paidByCardId === (editing.paidByCardId ?? null) &&
          input.link === (editing.link ?? null) &&
          input.expenseId === (editing.expenseId ?? null) &&
          JSON.stringify(input.lines) === JSON.stringify(editing.lines);
        if (!isUnchanged) {
          await editPurchase(
            user.uid,
            encryption,
            editing,
            input,
            describePurchaseEdit(
              editing,
              input,
              nameOf,
              nameOfCard,
              nameOfGroup,
            ),
          );
        }
        await finishReceipts(
          editing.id,
          !isUnchanged
            ? isRefund
              ? 'Refund saved'
              : 'Purchase saved'
            : receiptFiles.length > 0
              ? SPEND_WORDS.receiptAdded(receiptFiles.length)
              : null,
        );
        onClose();
        return;
      }
      const purchaseId = await addPurchase(user.uid, encryption, input);
      if (isUsualCard) countUsualNote(usualNotesSeen);
      await finishReceipts(
        purchaseId,
        isRefund ? 'Refund added' : 'Purchase added',
      );
      onClose();
    } catch (saveError) {
      if (isMounted.current) {
        setError(
          isOfflineFailure(saveError)
            ? SPEND_WORDS.offline
            : getErrorMessage(
                saveError,
                'This did not save. Nothing was changed.',
              ),
        );
        setIsSaving(false);
      }
    }
  };

  const candidates = others.filter(
    (purchase) =>
      purchase.amountCents > 0 &&
      getRefundableCents(purchase, others) > 0 &&
      getPurchaseTitle(purchase, nameOf)
        .toLowerCase()
        .includes(originQuery.trim().toLowerCase()),
  );

  const usage = purchases
    .slice(0, RECENT_PURCHASES)
    .flatMap((purchase) => purchase.lines)
    .reduce<Record<string, number>>(
      (acc, line) =>
        line.envelopeId === null
          ? acc
          : { ...acc, [line.envelopeId]: (acc[line.envelopeId] ?? 0) + 1 },
      {},
    );
  const ranked = liveOptions
    .map((option, index) => ({ option, index }))
    .sort(
      (a, b) =>
        (usage[b.option.id] ?? 0) - (usage[a.option.id] ?? 0) ||
        a.index - b.index,
    )
    .map(({ option }) => option);
  const hasMore = options.length > MOST_USED_SHOWN + 1;
  const shownOptions = hasMore
    ? [
        ...ranked.slice(0, MOST_USED_SHOWN),
        ...options.filter(
          (option) =>
            option.id === envelopeId &&
            !ranked.slice(0, MOST_USED_SHOWN).includes(option),
        ),
      ]
    : options;
  const envelopePills = shownOptions.map((option) => ({
    value: option.id,
    label: option.name,
    emoji: option.emoji ?? undefined,
  }));
  const allPills = options.map((option) => ({
    value: option.id,
    label: option.name,
    emoji: option.emoji ?? undefined,
  }));
  const envelopeQuery = envelopeSearch.trim().toLowerCase();
  const foundOptions = options.filter((option) =>
    option.name.toLowerCase().includes(envelopeQuery),
  );

  const setExtras = (patch: Partial<PurchaseFormData['extras']>) =>
    setFormData((current) => ({
      ...current,
      extras: { ...current.extras, ...patch },
    }));
  const { extras } = formData;

  const getCardLine = () => {
    if (cardId === null || isRefund || amount === null || !isCounted) {
      return null;
    }
    const savedCents =
      isEditingCounted && editing?.paidByCardId === cardId
        ? editing.amountCents
        : 0;
    const name = nameOfCard(cardId);
    if (savedCents === 0) return CARD_WORDS.addsOwed(name, formatCents(amount));
    if (amount > savedCents) {
      return CARD_WORDS.addsOwedMore(name, formatCents(amount - savedCents));
    }
    if (amount < savedCents) {
      return CARD_WORDS.addsOwedLess(name, formatCents(savedCents - amount));
    }
    return null;
  };
  const cardLine = getCardLine();
  const effectNote = (preview || cardLine) && (
    <div className='space-y-2'>
      {preview && (
        <PurchaseEffectNotice
          changes={preview.changes}
          freeDropCents={preview.freeDropCents}
        />
      )}
      {cardLine && <CardChargeNotice line={cardLine} />}
    </div>
  );
  const getEnvelopeSummary = () => {
    if (lines === null) return '';
    if (isRefund) return `Back to ${describeEnvelopes(lines, nameOf)}`;
    return describeEnvelopes(lines, nameOf);
  };
  const todayValue = toDateInputValue(today);

  const steps: QuestionStep[] = [
    {
      id: 'amount',
      title: isRefund
        ? FORM_FLOW_WORDS.refundAmountTitle
        : FORM_FLOW_WORDS.purchaseAmountTitle,
      summaryLabel: isRefund ? SPEND_WORDS.refundAmount : SPEND_WORDS.amount,
      summaryValue: amount === null ? '' : formatCents(amount),
      isAnswered: amount !== null,
      blocker:
        formData.amount.trim() === ''
          ? null
          : (parsed !== null && parsed > 0) || isTooLong(formData.amount)
            ? FORM_FLOW_WORDS.overLimit
            : FORM_FLOW_WORDS.badAmount,
      render: () => (
        <AmountHero
          label={isRefund ? SPEND_WORDS.refundAmount : SPEND_WORDS.amount}
          value={formData.amount}
          onChange={(next) =>
            setFormData((current) => ({ ...current, amount: next }))
          }
          disabled={isSaving}
          ways={
            editing
              ? []
              : [
                  {
                    label: isRefund
                      ? FORM_FLOW_WORDS.notRefundLink
                      : FORM_FLOW_WORDS.refundLink,
                    onClick: toggleRefund,
                  },
                ]
          }
        />
      ),
    },
    {
      id: 'envelope',
      title: isRefund
        ? FORM_FLOW_WORDS.refundForTitle
        : FORM_FLOW_WORDS.purchaseForTitle,
      summaryLabel: isRefund ? SPEND_WORDS.returnsTo : SPEND_WORDS.envelope,
      summaryValue: getEnvelopeSummary(),
      isAnswered: lines !== null,
      blocker: isSplit && !isRefund ? SPEND_WORDS.needsShares : null,
      isPreAnswered:
        !isRefund &&
        presetEnvelopeId !== null &&
        envelopeId === presetEnvelopeId,
      render: ({ moveOn }) => (
        <div className='space-y-4'>
          {isRefund && (
            <SummaryRow
              label={SPEND_WORDS.refundOf}
              onClick={() => setView('original')}
              detail={
                original !== null && returnsToOriginal && lines
                  ? `Returns to ${describeEnvelopes(lines, nameOf)}.`
                  : undefined
              }
            >
              {original === null
                ? SPEND_WORDS.noOriginal
                : getPurchaseTitle(original, nameOf)}
            </SummaryRow>
          )}
          {isRefund && !returnsToOriginal && (
            <div className='space-y-2'>
              <p className='text-muted-foreground text-xs'>
                {SPEND_WORDS.returnsTo}
              </p>
              <PillGroup
                label={SPEND_WORDS.returnsTo}
                options={[
                  { value: FREE_VALUE, label: SPEND_WORDS.freeToSpend },
                  ...allPills,
                ]}
                value={returnTo}
                onChange={(id) => {
                  setReturnTo(id);
                  if (amount !== null) moveOn();
                }}
              />
            </div>
          )}
          {!isRefund && !isSplit && (
            <div className='space-y-2'>
              <PillGroup
                label={SPEND_WORDS.envelope}
                options={envelopePills}
                value={envelopeId}
                onChange={(id) => {
                  setEnvelopeId(id);
                  if (amount !== null) moveOn();
                }}
              />
              {(hasMore || (amount !== null && options.length >= 2)) && (
                <div className='flex flex-wrap gap-2'>
                  {hasMore && (
                    <RevealChip
                      icon={<Search className='h-4 w-4' />}
                      onClick={() => {
                        setEnvelopeSearch('');
                        setView('envelopes');
                      }}
                    >
                      {FORM_FLOW_WORDS.more}
                    </RevealChip>
                  )}
                  {amount !== null && options.length >= 2 && (
                    <RevealChip onClick={startSplit}>
                      {SPEND_WORDS.split}
                    </RevealChip>
                  )}
                </div>
              )}
            </div>
          )}
          {!isRefund && isSplit && (
            <div className='space-y-2'>
              <SummaryRow
                label={SPEND_WORDS.splitLabel}
                onClick={() => setView('split')}
              >
                {splitIds.length === 0 ? (
                  'Pick the envelopes'
                ) : (
                  <MaskedText>
                    {splitIds
                      .map(
                        (id) =>
                          `${nameOf(id)} ${formatCents(parseMoneyToCents(shares[id] ?? '') ?? 0)}`,
                      )
                      .join(', ')}
                  </MaskedText>
                )}
              </SummaryRow>
              <div>
                <RevealChip onClick={stopSplit}>
                  {SPEND_WORDS.unsplit}
                </RevealChip>
              </div>
            </div>
          )}
          {effectNote}
        </div>
      ),
    },
    ...(cardOptions.length > 0 && !(isRefund && original !== null)
      ? [
          {
            id: 'paidBy',
            title: CARD_WORDS.paidByTitle,
            summaryLabel: CARD_WORDS.paidBy,
            summaryValue:
              paidByChoice === undefined && !isUsualCard
                ? ''
                : nameOfCard(cardId),
            summaryDetail:
              isUsualCard &&
              envelopeId !== null &&
              usualNotesSeen < USUAL_NOTE_TIMES
                ? CARD_WORDS.usualCard(nameOf(envelopeId))
                : undefined,
            isAnswered: paidByChoice !== undefined || isUsualCard,
            isPreAnswered: isUsualCard,
            render: ({ moveOn }: QuestionControls) => (
              <PillGroup
                label={CARD_WORDS.paidBy}
                options={[
                  { value: CASH_VALUE, label: CARD_WORDS.cashOrDebit },
                  ...cardOptions.map((card) => ({
                    value: card.id,
                    label: getCardName(card, allCards),
                  })),
                ]}
                value={
                  paidByChoice === undefined && !isUsualCard
                    ? null
                    : (paidByCardId ?? CASH_VALUE)
                }
                onChange={(value) => {
                  setPaidByChoice(value === CASH_VALUE ? null : value);
                  moveOn();
                }}
              />
            ),
          },
        ]
      : []),
    {
      id: 'day',
      title: FORM_FLOW_WORDS.dayTitle,
      summaryLabel: SPEND_WORDS.day,
      summaryValue:
        formData.date === todayValue
          ? 'Today'
          : date === null
            ? ''
            : formatDateUTC(date),
      isAnswered: date !== null && date <= today,
      isPreAnswered: true,
      render: () => (
        <Input
          type='date'
          variant='outline'
          aria-label={SPEND_WORDS.day}
          max={todayValue}
          value={formData.date}
          disabled={isSaving}
          onChange={(event) =>
            setFormData((current) => ({
              ...current,
              date: event.target.value,
            }))
          }
        />
      ),
    },
  ];
  const mask = useMaskedText();
  const maskNote = (note: string | null | undefined) =>
    note ? mask(note) : null;
  const questions = useQuestionFlow({
    steps: maskSummaries(steps, isHidden),
    startFolded: editing !== undefined,
  });
  const isAsking = !questions.hasReviewed;
  const requestClose = useDiscardGuard({
    isDirty: snapshot !== startSnapshot || pickedReceipts !== null,
    onClose: onCancel ?? onClose,
    isBusy: isSaving,
    title: editing
      ? FORM_FLOW_WORDS.discardChange
      : FORM_FLOW_WORDS.discardNew('purchase'),
  });

  const formBody = (
    <div className='space-y-5'>
      <QuestionFlow flow={questions} />
      {questions.hasReviewed && (
        <div className='space-y-3'>
          <OptionalDetailRows
            heading={SPEND_WORDS.moreDetails}
            removeLabel={SPEND_WORDS.removeDetail}
            openKey={openExtra}
            onOpen={(key) => setOpenExtra(key as ExtraKey)}
            onClose={() => setOpenExtra(null)}
            onRemove={(key) => {
              if (key === 'receipt') {
                dropReceipts(pickedReceipts ?? []);
                setPickedReceipts(null);
                setReceiptNote(null);
                return;
              }
              setExtras(
                key === 'group'
                  ? { group: null, groupName: '' }
                  : { [key]: null },
              );
            }}
            details={[
              ...EXTRAS.flatMap<OptionalDetail>(({ key, words, maxLength }) => {
                const text = extras[key];
                if (text === null) return [];
                if (key === 'group') {
                  const name =
                    text === NEW_CHOICE
                      ? extras.groupName.trim()
                      : (expenses.find((expense) => expense.id === text)
                          ?.name ?? '');
                  return [
                    {
                      key,
                      label: words.name,
                      value: mask(name),
                      isEmpty: name === '',
                      render: () => (
                        <PickOrCreate
                          label={SPEND_WORDS.groupLabel}
                          options={expenses.map((expense) => ({
                            value: expense.id,
                            label: expense.name,
                          }))}
                          choice={text}
                          newText={extras.groupName}
                          onChange={(choice, newText) =>
                            setExtras({ group: choice, groupName: newText })
                          }
                          newPillLabel={SPEND_WORDS.newGroup}
                          newPlaceholder={words.placeholder}
                          maxLength={maxLength}
                          hasPlus={false}
                        />
                      ),
                    },
                  ];
                }
                return [
                  {
                    key,
                    label: words.name,
                    value: mask(
                      key === 'link'
                        ? (getWebLinkHost(text) ?? text.trim())
                        : text.trim(),
                    ),
                    isEmpty: text.trim() === '',
                    render: () => (
                      <div className='space-y-3'>
                        <Input
                          variant='outline'
                          aria-label={words.name}
                          maxLength={maxLength}
                          placeholder={words.placeholder}
                          value={text}
                          {...(key === 'link'
                            ? { type: 'url', inputMode: 'url' as const }
                            : {})}
                          onChange={(event) =>
                            setExtras({ [key]: event.target.value })
                          }
                        />
                        {key === 'link' && linkPreview && (
                          <LinkPreviewCard preview={linkPreview} />
                        )}
                      </div>
                    ),
                  },
                ];
              }),
              ...(pickedReceipts === null
                ? []
                : [
                    {
                      key: 'receipt',
                      label: SPEND_WORDS.receipt,
                      value: SPEND_WORDS.receiptPhotos(pickedReceipts.length),
                      isEmpty: pickedReceipts.length === 0,
                      render: () => (
                        <div className='space-y-3'>
                          <p className='text-muted-foreground text-xs'>
                            {SPEND_WORDS.receiptHelp}
                          </p>
                          <Button
                            type='button'
                            variant='secondary'
                            className='h-11 w-full gap-1.5'
                            disabled={
                              pickedReceipts.length >= MAX_RECEIPTS_PER_PURCHASE
                            }
                            onClick={() => receiptChooser.current?.open()}
                          >
                            <ImagePlus className='h-4 w-4' aria-hidden='true' />
                            {SPEND_WORDS.chooseReceipts}
                          </Button>
                          <ReceiptFileInput
                            chooser={receiptChooser}
                            onFiles={addReceiptFiles}
                          />
                          {receiptNote && (
                            <p
                              className='text-muted-foreground text-xs'
                              role='status'
                            >
                              {receiptNote}
                            </p>
                          )}
                          {pickedReceipts.length > 0 && (
                            <ul className='grid grid-cols-3 gap-3'>
                              {pickedReceipts.map((picked) => (
                                <li key={picked.url} className='space-y-1.5'>
                                  <FallbackImage
                                    src={picked.url}
                                    alt={picked.file.name}
                                    className='border-border aspect-square w-full rounded-xl border object-cover'
                                  />
                                  <Button
                                    type='button'
                                    variant='secondary'
                                    size='sm'
                                    className="relative w-full before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
                                    onClick={() => {
                                      dropReceipts([picked]);
                                      setPickedReceipts(
                                        pickedReceipts.filter(
                                          (entry) => entry !== picked,
                                        ),
                                      );
                                    }}
                                  >
                                    {SPEND_WORDS.removeReceiptFile}
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ),
                    },
                  ]),
            ]}
          />
          {(EXTRAS.some(({ key }) => extras[key] === null) ||
            pickedReceipts === null) && (
            <div className='flex flex-wrap gap-2'>
              {EXTRAS.filter(({ key }) => extras[key] === null).map(
                ({ key, words }) => (
                  <RevealChip
                    key={key}
                    onClick={() => {
                      setExtras({ [key]: '' });
                      setOpenExtra(key);
                    }}
                  >
                    {words.add}
                  </RevealChip>
                ),
              )}
              {pickedReceipts === null && (
                <RevealChip
                  onClick={() => {
                    setPickedReceipts([]);
                    setOpenExtra('receipt');
                  }}
                >
                  {SPEND_WORDS.addReceipt}
                </RevealChip>
              )}
            </div>
          )}
          {effectNote}
        </div>
      )}
      <ModalFooterActions
        note={error ?? maskNote(isAsking ? questions.blocker : blocker)}
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={requestClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
        }
        rightActions={
          isAsking ? (
            <Button
              type='button'
              disabled={!questions.open?.isAnswered}
              onClick={questions.advance}
            >
              {FORM_FLOW_WORDS.next}
            </Button>
          ) : (
            <Button
              type='button'
              loading={isSaving}
              disabled={isSaving || blocker !== null}
              onClick={() => void handleSave()}
            >
              {editing ? SPEND_WORDS.save : SPEND_WORDS.add}
            </Button>
          )
        }
      />
    </div>
  );

  const getSplitBlocker = () => {
    if (splitIds.length < 2) return SPEND_WORDS.needsTwo;
    const placed = splitIds.reduce(
      (sum, id) => sum + (parseMoneyToCents(shares[id] ?? '') ?? 0),
      0,
    );
    return amount !== null && placed !== amount
      ? SPEND_WORDS.needsShares
      : null;
  };
  const splitBlocker = getSplitBlocker();

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={SPEND_WORDS.sheetTitle}
      actions={<ValuesEyeButton />}
    >
      {view === 'split' && amount !== null && (
        <div className='space-y-3'>
          <SplitEditor
            totalCents={amount}
            envelopes={options}
            ids={splitIds}
            shares={shares}
            onIdsChange={(ids) => {
              setSplitIds(ids);
              setShares((current) =>
                Object.fromEntries(ids.map((id) => [id, current[id] ?? ''])),
              );
            }}
            onShareChange={(id, text) =>
              setShares((current) => ({ ...current, [id]: text }))
            }
            onEvenly={evenShares}
            onBack={leaveSplit}
            isSaving={isSaving}
          />
          <ModalFooterActions
            note={splitBlocker}
            rightActions={
              <Button
                type='button'
                disabled={splitBlocker !== null}
                onClick={() => setView('form')}
              >
                {SPEND_WORDS.splitDone}
              </Button>
            }
          />
        </div>
      )}
      {view === 'original' && (
        <div className='space-y-3'>
          <BackLink onBack={() => setView('form')} />
          <p className='text-muted-foreground text-sm'>
            {SPEND_WORDS.pickOriginal}
          </p>
          <Button
            type='button'
            variant='secondary'
            className='h-10 w-full justify-start'
            onClick={() => {
              setOriginalId(null);
              setView('form');
            }}
          >
            {SPEND_WORDS.noOriginal}
          </Button>
          {others.length >= RUNWAY_SEARCH_THRESHOLD && (
            <SearchInput
              value={originQuery}
              onChange={setOriginQuery}
              placeholder={SPEND_WORDS.search}
            />
          )}
          {candidates.length === 0 && (
            <p className='text-muted-foreground text-sm'>
              {SPEND_WORDS.noMatch}
            </p>
          )}
          <ul className='border-border divide-border divide-y rounded-2xl border'>
            {candidates.slice(0, ORIGIN_PAGE).map((purchase) => (
              <li key={purchase.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  className='text-foreground! h-auto w-full items-start justify-between gap-3 px-3! py-3 text-left font-normal whitespace-normal'
                  onClick={() => {
                    setOriginalId(purchase.id);
                    setView('form');
                  }}
                >
                  <span className='min-w-0'>
                    <span className='line-clamp-2 font-medium break-words'>
                      {getPurchaseTitle(purchase, nameOf)}
                    </span>
                    <span className='text-muted-foreground block text-sm'>
                      {formatDateUTC(purchase.date)}
                    </span>
                  </span>
                  <span className='shrink-0 font-semibold whitespace-nowrap tabular-nums'>
                    <SensitiveValue>
                      {formatCents(purchase.amountCents)}
                    </SensitiveValue>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {view === 'envelopes' && (
        <div className='space-y-3'>
          <BackLink onBack={() => setView('form')} />
          <p className='text-lg font-semibold'>{FORM_FLOW_WORDS.moreTitle}</p>
          {options.length >= RUNWAY_SEARCH_THRESHOLD && (
            <SearchInput
              value={envelopeSearch}
              onChange={setEnvelopeSearch}
              placeholder={FORM_FLOW_WORDS.findEnvelope}
            />
          )}
          {foundOptions.length === 0 && (
            <p className='text-muted-foreground text-sm'>
              {FORM_FLOW_WORDS.noEnvelopeMatch}
            </p>
          )}
          <ul className='border-border divide-border max-h-[max(9rem,calc(92dvh-22rem))] divide-y overflow-y-auto rounded-2xl border [@media(max-height:499px)]:max-h-none'>
            {foundOptions.map((option) => (
              <li key={option.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  aria-pressed={option.id === envelopeId}
                  className='text-foreground! h-auto min-h-12 w-full items-center justify-between gap-3 px-3! py-2 text-left font-normal whitespace-normal'
                  onClick={() => {
                    setEnvelopeId(option.id);
                    setView('form');
                    if (amount !== null && questions.open?.id === 'envelope')
                      questions.moveOnFrom('envelope');
                  }}
                >
                  <span className='flex w-full min-w-0 items-center gap-3'>
                    <ItemBadge name={option.name} emoji={option.emoji} />
                    <span className='line-clamp-2 min-w-0 flex-1 text-left font-medium break-words'>
                      {option.name}
                    </span>
                    <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap tabular-nums'>
                      <SensitiveValue>
                        {formatCents(option.leftCents)}
                      </SensitiveValue>
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={join(view !== 'form' && 'hidden')}>{formBody}</div>
    </FormSheet>
  );
}

export default PurchaseForm;
