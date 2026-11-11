import { useRef, useEffect, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AmountHero from '@/components/AmountHero';
import DateInput from '@/components/DateInput';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import Pill from '@/components/Pill';
import { PillGroup } from '@/components/PillGroup';
import DraftRestoredNotice from '@/components/DraftRestoredNotice';
import QuestionFlow from '@/components/QuestionFlow';
import RevealChip from '@/components/RevealChip';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useFormDraft, useKeepFormDraft } from '@/hooks/useFormDraft';
import {
  useQuestionFlow,
  type QuestionControls,
  type QuestionStep,
} from '@/hooks/useQuestionFlow';
import { store, useAppSelector } from '@/store';
import { useNow } from '@/hooks/useNow';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { clearFormDraft } from '@lib/app/formDrafts';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import {
  CARD_FEE_WORDS,
  CARD_ISSUERS,
  HELD_WORDS,
  CARD_WORDS,
  FORM_DRAFT_PREFIX,
  FORM_FLOW_WORDS,
  MAX_NAME_LENGTH,
  MAX_PURCHASE_CENTS,
} from '@apps/runway/constants';
import {
  isFlag,
  isNullableOneOf,
  isNullableText,
  isText,
  isWholeNumber,
  readDraftFields,
  withDraftDefaults,
} from '@apps/runway/forms/draftParse';
import {
  withStartOver,
  type StartOverProps,
} from '@apps/runway/forms/withStartOver';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  getPullAccounts,
  keepPullAccountId,
} from '@apps/runway/engine/accounts';
import LastFourField from '@apps/runway/forms/LastFourField';
import {
  describeAccountLine,
  isLastFour,
} from '@apps/runway/utils/accountText';
import {
  createCard,
  newCardId,
  updateCard,
} from '@apps/runway/store/actions/cardActions';
import HeldChoiceList from '@apps/runway/components/HeldChoiceList';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getNextFeeOn } from '@apps/runway/engine/cardFees';
import type { HeldChoice } from '@apps/runway/engine/endings';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  getFeeHeldCents,
  getFeePlan,
  isFeeBillLive,
} from '@apps/runway/utils/cardFeePlan';
import {
  selectAccounts,
  selectIsAccountsLoaded,
  selectAllAccounts,
  selectAllCards,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenAccount, OpenCard } from '@apps/runway/types';
import {
  describeCardAdded,
  describeCardChanged,
  getCardName,
  hasUnnamedCardFrom,
  resolveIssuer,
} from '@apps/runway/utils/cardText';
import { LAST_DAY, toOrdinal } from '@apps/runway/utils/monthDays';
import { maskSummaries } from '@apps/runway/utils/maskSummaries';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { useValuesHidden } from '@/hooks/useValuesHidden';

const OTHER_VALUE = 'other';
const NO_ACCOUNT_VALUE = 'none';
const DUE_DAYS = Array.from({ length: LAST_DAY }, (_, index) => index + 1);

interface CardFormData {
  /** A known issuer, or `other` when the bank is typed. */
  issuerPick: string | null;
  otherIssuer: string;
  name: string;
  hasNoName: boolean;
  owed: string;
  /** The day of the month it is due, when one was picked. */
  dueDay: number | null;
  hasNoDueDay: boolean;
  lastFour: string;
  hasNoLastFour: boolean;
  /** The account that pays it; null until one is picked. */
  payFromAccountId: string | null;
  /** The annual fee as typed. */
  fee: string;
  hasNoFee: boolean;
  /** The fee's next date as the date box holds it. */
  feeDate: string;
  /** Where the money set aside for a fee that is cleared goes; null until picked. */
  feeHeld: HeldChoice | null;
}

interface CardFormProps {
  isOpen: boolean;
  onClose: () => void;
  /** Where Cancel and Discard go, when that is not where a save goes. */
  onCancel?: () => void;
  /** The card being changed. */
  editing?: OpenCard;
}

const isOfflineFailure = (error: unknown) =>
  !navigator.onLine ||
  /offline|unavailable/i.test(error instanceof Error ? error.message : '');

const parseCardDraft = (stored: unknown, isEditing: boolean) => {
  const data = readDraftFields<CardFormData>(
    withDraftDefaults(stored, {
      lastFour: '',
      hasNoLastFour: isEditing,
      payFromAccountId: null,
      fee: '',
      hasNoFee: isEditing,
      feeDate: '',
      feeHeld: null,
    }),
    {
      issuerPick: isNullableOneOf([...CARD_ISSUERS, OTHER_VALUE]),
      otherIssuer: isText,
      name: isText,
      hasNoName: isFlag,
      owed: isText,
      dueDay: (value) =>
        value === null ||
        (isWholeNumber(value) && DUE_DAYS.includes(value as number)),
      hasNoDueDay: isFlag,
      lastFour: isText,
      hasNoLastFour: isFlag,
      payFromAccountId: isNullableText,
      fee: isText,
      hasNoFee: isFlag,
      feeDate: isText,
      feeHeld: isNullableOneOf(['free', 'keep']),
    },
  );
  return data;
};

const getInitialData = (
  editing: OpenCard | undefined,
  pullAccounts: readonly OpenAccount[],
  isAccountsLoaded: boolean,
  today: number,
): CardFormData => {
  if (!editing) {
    return {
      issuerPick: null,
      otherIssuer: '',
      name: '',
      hasNoName: false,
      owed: '',
      dueDay: null,
      hasNoDueDay: false,
      lastFour: '',
      hasNoLastFour: false,
      payFromAccountId: null,
      fee: '',
      hasNoFee: false,
      feeDate: '',
      feeHeld: null,
    };
  }
  const fee = editing.annualFee ?? null;
  const known = CARD_ISSUERS.find((issuer) => issuer === editing.issuer);
  return {
    issuerPick: known ?? OTHER_VALUE,
    otherIssuer: known ? '' : editing.issuer,
    name: editing.name ?? '',
    hasNoName: editing.name === null,
    owed: '',
    dueDay: editing.dueDay,
    hasNoDueDay: editing.dueDay === null,
    lastFour: editing.lastFour ?? '',
    hasNoLastFour: !editing.lastFour,
    payFromAccountId: keepPullAccountId(
      editing.payFromAccountId,
      pullAccounts,
      isAccountsLoaded,
    ),
    fee: fee === null ? '' : centsToInputValue(fee.cents),
    hasNoFee: fee === null,
    feeDate:
      fee === null ? '' : toDateInputValue(getNextFeeOn(fee.firstDueOn, today)),
    feeHeld: null,
  };
};

/** Adds a card, or changes who issues it, what it is called and the day it is due. Adding can also say what it owed on the starting day. */
function CardFormBody({
  isOpen,
  onClose,
  onCancel,
  editing,
  onStartOver,
}: CardFormProps & StartOverProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const { isHidden } = useValuesHidden();
  const maskNote = (note: string | null) => (note ? mask(note) : null);
  const isMounted = useRef(true);
  const cards = useAppSelector(selectAllCards);
  const openAccounts = useAppSelector(selectAccounts);
  const isAccountsLoaded = useAppSelector(selectIsAccountsLoaded);
  const allAccounts = useAppSelector(selectAllAccounts);
  const pullAccounts = getPullAccounts(openAccounts);
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? null,
  );
  const today = todayAsUtcDate(useNow(60_000));
  const assignedByItem = useAppSelector(
    (state) => selectBalances(state).assignedByItem,
  );
  const [openedAt] = useState(() => editing?.updatedAt);
  const [startData] = useState(() =>
    getInitialData(editing, pullAccounts, isAccountsLoaded, today),
  );
  const draftKey = `${FORM_DRAFT_PREFIX}card:${editing?.id ?? 'new'}`;
  // A new form's draft doesn't depend on the day or the door it was opened from; an edit's is tied to the record.
  const draftBase = editing ? startData : null;
  const draft = useFormDraft({
    key: draftKey,
    base: draftBase,
    parse: (stored) => parseCardDraft(stored, editing !== undefined),
  });
  const [formData, setFormData] = useState<CardFormData>(
    draft.restored ?? startData,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const set = (patch: Partial<CardFormData>) =>
    setFormData((current) => ({ ...current, ...patch }));

  const issuer =
    formData.issuerPick === OTHER_VALUE
      ? formData.otherIssuer.trim() === ''
        ? ''
        : resolveIssuer(formData.otherIssuer)
      : (formData.issuerPick ?? '');
  const typedName = formData.name.trim();
  // People type the card's full name ("Capital One Venture X"); the issuer is already its first word.
  const getName = () => {
    const lower = issuer.toLowerCase();
    if (
      issuer === '' ||
      typedName === (editing?.name ?? null) ||
      !typedName.toLowerCase().startsWith(lower)
    ) {
      return typedName;
    }
    const rest = typedName.slice(issuer.length);
    if (rest === '') return '';
    return rest.startsWith(' ') ? rest.trim() : typedName;
  };
  const name = getName();
  const hasName = name !== '';
  const owedText = formData.owed.trim();
  const owedCents = owedText === '' ? 0 : parseMoneyToCents(formData.owed);
  const isOwedValid =
    owedCents !== null && owedCents >= 0 && owedCents <= MAX_PURCHASE_CENTS;
  const asksOwed = editing === undefined && startDate !== null;
  const isDueAnswered = formData.dueDay !== null || formData.hasNoDueDay;
  const isLastFourAnswered =
    formData.hasNoLastFour || isLastFour(formData.lastFour);
  const payFromAccountId = keepPullAccountId(
    formData.payFromAccountId,
    pullAccounts,
    isAccountsLoaded,
  );
  const payFromName =
    pullAccounts.find((account) => account.id === payFromAccountId)?.name ??
    CARD_WORDS.payFromNone;
  const hasOther = hasUnnamedCardFrom(issuer, cards, editing?.id ?? null);
  const feeBefore = editing?.annualFee ?? null;
  const feeCents =
    formData.fee.trim() === '' ? null : parseMoneyToCents(formData.fee);
  const isFeeValid =
    feeCents !== null && feeCents > 0 && feeCents <= MAX_PURCHASE_CENTS;
  const isFeeAnswered = formData.hasNoFee || isFeeValid;
  const feeOn =
    formData.feeDate === ''
      ? null
      : (fromDateInputValue(formData.feeDate) ?? null);
  const isFeeDateAnswered =
    formData.hasNoFee || (feeOn !== null && feeOn >= today);
  // An unchanged next date keeps the first date the card was given, so the bill's schedule isn't rewritten.
  const getFeeFirstDueOn = (on: number) =>
    feeBefore !== null && getNextFeeOn(feeBefore.firstDueOn, today) === on
      ? feeBefore.firstDueOn
      : on;
  const feeAfter =
    formData.hasNoFee || !isFeeValid || feeOn === null || feeCents === null
      ? null
      : { cents: feeCents, firstDueOn: getFeeFirstDueOn(feeOn) };
  const feeHeldCents = getFeeHeldCents(assignedByItem, feeBefore);
  const isFeeBillOpen = useAppSelector((state) =>
    feeBefore === null ? false : isFeeBillLive(state, feeBefore.billId),
  );
  const asksFeeHeld = formData.hasNoFee && feeHeldCents > 0 && isFeeBillOpen;

  const steps: QuestionStep[] = [
    {
      id: 'issuer',
      title: CARD_WORDS.issuerTitle,
      summaryLabel: CARD_WORDS.issuerLabel,
      summaryValue: issuer,
      isAnswered: issuer !== '',
      blocker: CARD_WORDS.needsIssuer,
      render: ({ moveOn }) => (
        <div className='space-y-3'>
          <PillGroup
            label={CARD_WORDS.issuerLabel}
            options={[
              ...CARD_ISSUERS.map((value) => ({ value, label: value })),
              { value: OTHER_VALUE, label: CARD_WORDS.anotherBank },
            ]}
            value={formData.issuerPick}
            onChange={(issuerPick) => {
              set({ issuerPick });
              if (issuerPick !== OTHER_VALUE) moveOn();
            }}
          />
          {formData.issuerPick === OTHER_VALUE && (
            <Input
              variant='outline'
              autoFocus
              aria-label={CARD_WORDS.anotherBank}
              placeholder={CARD_WORDS.otherBankPlaceholder}
              maxLength={MAX_NAME_LENGTH}
              value={formData.otherIssuer}
              onChange={(event) => set({ otherIssuer: event.target.value })}
            />
          )}
        </div>
      ),
    },
    {
      id: 'name',
      title: hasOther ? CARD_WORDS.nameSecond(issuer) : CARD_WORDS.nameTitle,
      summaryLabel: CARD_WORDS.nameLabel,
      summaryValue: hasName
        ? name
        : formData.hasNoName
          ? CARD_WORDS.noNameValue
          : '',
      isAnswered: hasName || formData.hasNoName,
      blocker: CARD_WORDS.needsName,
      render: ({ moveOn }) => (
        <div className='space-y-3'>
          <Input
            variant='outline'
            aria-label={CARD_WORDS.nameLabel}
            placeholder={CARD_WORDS.namePlaceholder}
            maxLength={MAX_NAME_LENGTH}
            value={formData.name}
            onChange={(event) =>
              set({ name: event.target.value, hasNoName: false })
            }
          />
          <div>
            <RevealChip
              onClick={() => {
                set({ name: '', hasNoName: true });
                moveOn();
              }}
            >
              {CARD_WORDS.noName}
            </RevealChip>
          </div>
        </div>
      ),
    },
    {
      id: 'lastFour',
      title: CARD_WORDS.lastFourTitle,
      summaryLabel: CARD_WORDS.lastFourLabel,
      summaryValue: formData.hasNoLastFour
        ? CARD_WORDS.lastFourNone
        : isLastFour(formData.lastFour)
          ? `••${formData.lastFour}`
          : '',
      isAnswered: isLastFourAnswered,
      blocker: CARD_WORDS.needsFourDigits,
      render: ({ moveOn }) => (
        <LastFourField
          label={CARD_WORDS.lastFourLabel}
          hint={CARD_WORDS.lastFourHint}
          skipLabel={CARD_WORDS.lastFourSkip}
          value={formData.lastFour}
          onChange={(value) => set({ lastFour: value, hasNoLastFour: false })}
          onSkip={() => {
            set({ lastFour: '', hasNoLastFour: true });
            moveOn();
          }}
        />
      ),
    },
    ...(asksOwed
      ? [
          {
            id: 'owed',
            title: CARD_WORDS.owesTitle,
            summaryLabel: CARD_WORDS.owesLabel,
            summaryValue:
              owedCents !== null && owedCents > 0
                ? formatCents(owedCents)
                : CARD_WORDS.nothingYet,
            isAnswered: isOwedValid,
            blocker: FORM_FLOW_WORDS.badAmount,
            render: () => (
              <AmountHero
                label={CARD_WORDS.owesLabel}
                value={formData.owed}
                onChange={(owed) => set({ owed })}
                hint={CARD_WORDS.owesHint}
                disabled={isSaving}
              />
            ),
          } satisfies QuestionStep,
        ]
      : []),
    {
      id: 'due',
      title: CARD_WORDS.dueTitle,
      summaryLabel: CARD_WORDS.dueLabel,
      summaryValue: formData.hasNoDueDay
        ? CARD_WORDS.noDueDay
        : formData.dueDay === null
          ? ''
          : CARD_WORDS.dueSummaryDay(
              formData.dueDay,
              toOrdinal(formData.dueDay),
            ),
      isAnswered: isDueAnswered,
      blocker: CARD_WORDS.needsDue,
      render: ({ moveOn }) => (
        <div className='space-y-3'>
          <div
            className='grid grid-cols-7 gap-1.5'
            role='group'
            aria-label={CARD_WORDS.dueTitle}
          >
            {DUE_DAYS.map((day) => (
              <Pill
                key={day}
                className="relative w-full px-0! after:absolute after:-inset-x-[3px] after:inset-y-0 after:content-['']"
                isSelected={formData.dueDay === day}
                ariaLabel={day === LAST_DAY ? 'Last day' : toOrdinal(day)}
                onClick={() => {
                  set({ dueDay: day, hasNoDueDay: false });
                  moveOn();
                }}
              >
                {String(day)}
              </Pill>
            ))}
          </div>
          <div>
            <RevealChip
              onClick={() => {
                set({ dueDay: null, hasNoDueDay: true });
                moveOn();
              }}
            >
              {CARD_WORDS.noDueDay}
            </RevealChip>
          </div>
        </div>
      ),
    },
    {
      id: 'annualFee',
      title: CARD_FEE_WORDS.feeTitle,
      summaryLabel: CARD_FEE_WORDS.feeLabel,
      summaryValue: formData.hasNoFee
        ? CARD_FEE_WORDS.feeNone
        : isFeeValid
          ? formatCents(feeCents)
          : '',
      isAnswered: isFeeAnswered,
      blocker: CARD_FEE_WORDS.needsFee,
      render: ({ moveOn }) => (
        <div className='space-y-3'>
          <AmountHero
            label={CARD_FEE_WORDS.feeLabel}
            value={formData.fee}
            onChange={(fee) => set({ fee, hasNoFee: false, feeHeld: null })}
            hint={CARD_FEE_WORDS.feeHint}
            disabled={isSaving}
          />
          <div className='flex justify-center'>
            <RevealChip
              onClick={() => {
                set({ fee: '', hasNoFee: true });
                moveOn();
              }}
            >
              {CARD_FEE_WORDS.noFee}
            </RevealChip>
          </div>
        </div>
      ),
    },
    ...(formData.hasNoFee
      ? []
      : [
          {
            id: 'feeDate',
            title: CARD_FEE_WORDS.dateTitle,
            summaryLabel: CARD_FEE_WORDS.dateLabel,
            summaryValue:
              feeOn !== null && feeOn >= today
                ? formatDateOrdinalUTC(feeOn)
                : '',
            isAnswered: isFeeDateAnswered,
            blocker:
              feeOn !== null && feeOn < today
                ? CARD_FEE_WORDS.pastDate
                : CARD_FEE_WORDS.needsDate,
            render: () => (
              <DateInput
                variant='outline'
                aria-label={CARD_FEE_WORDS.dateLabel}
                min={toDateInputValue(today)}
                value={formData.feeDate}
                onChange={(event) => set({ feeDate: event.target.value })}
              />
            ),
          } satisfies QuestionStep,
        ]),
    ...(asksFeeHeld
      ? [
          {
            id: 'feeHeld',
            title: CARD_FEE_WORDS.heldTitle,
            summaryLabel: CARD_FEE_WORDS.heldTitle,
            summaryValue:
              formData.feeHeld === 'free'
                ? HELD_WORDS.freeTitle
                : formData.feeHeld === 'keep'
                  ? HELD_WORDS.keepTitle
                  : '',
            isAnswered: formData.feeHeld !== null,
            blocker: CARD_FEE_WORDS.needsHeld,
            render: ({ moveOn }: QuestionControls) => (
              <div className='space-y-2'>
                <p className='text-muted-foreground text-sm'>
                  {mask(CARD_FEE_WORDS.heldCaption(formatCents(feeHeldCents)))}
                </p>
                <HeldChoiceList
                  value={formData.feeHeld}
                  onChange={(feeHeld) => {
                    set({ feeHeld });
                    moveOn();
                  }}
                  freeBody={CARD_FEE_WORDS.heldFreeBody}
                  keepBody={HELD_WORDS.keepBody}
                />
              </div>
            ),
          } satisfies QuestionStep,
        ]
      : []),
    ...(pullAccounts.length >= 2
      ? [
          {
            id: 'payFrom',
            title: CARD_WORDS.payFromTitle,
            summaryLabel: CARD_WORDS.payFromLabel,
            summaryValue: payFromName,
            isAnswered: true,
            isPreAnswered: true,
            render: ({ moveOn }: QuestionControls) => (
              <PillGroup
                label={CARD_WORDS.payFromLabel}
                options={[
                  { value: NO_ACCOUNT_VALUE, label: CARD_WORDS.payFromNone },
                  ...pullAccounts.map((account) => ({
                    value: account.id,
                    label: account.name,
                    detail: describeAccountLine(account),
                  })),
                ]}
                value={payFromAccountId ?? NO_ACCOUNT_VALUE}
                onChange={(value) => {
                  set({
                    payFromAccountId: value === NO_ACCOUNT_VALUE ? null : value,
                  });
                  moveOn();
                }}
              />
            ),
          } satisfies QuestionStep,
        ]
      : []),
  ];
  const questions = useQuestionFlow({
    steps: maskSummaries(steps, isHidden),
    startFolded: editing !== undefined,
    foldAnswered: draft.restored !== null,
  });
  const isAsking = !questions.hasReviewed;
  const isDirty = JSON.stringify(formData) !== JSON.stringify(startData);
  useKeepFormDraft({
    isRestored: draft.restored !== null,
    key: draftKey,
    base: draftBase,
    value: formData,
    isDirty,
  });
  const startOver = () => {
    if (user) clearFormDraft(user.uid, draftKey);
    onStartOver();
  };
  const requestClose = useDiscardGuard({
    isDirty,
    onClose: onCancel ?? onClose,
    isBusy: isSaving,
    title: editing
      ? FORM_FLOW_WORDS.discardChange
      : FORM_FLOW_WORDS.discardNew(CARD_WORDS.discardNew),
  });
  const blocker =
    issuer === ''
      ? CARD_WORDS.needsIssuer
      : !hasName && !formData.hasNoName
        ? CARD_WORDS.needsName
        : !isLastFourAnswered
          ? CARD_WORDS.needsFourDigits
          : !isOwedValid
            ? FORM_FLOW_WORDS.badAmount
            : !isDueAnswered
              ? CARD_WORDS.needsDue
              : !isFeeAnswered
                ? CARD_FEE_WORDS.needsFee
                : !isFeeDateAnswered
                  ? feeOn !== null && feeOn < today
                    ? CARD_FEE_WORDS.pastDate
                    : CARD_FEE_WORDS.needsDate
                  : asksFeeHeld && formData.feeHeld === null
                    ? CARD_FEE_WORDS.needsHeld
                    : null;

  const handleSave = async () => {
    if (!user || blocker !== null) return;
    setError(null);
    setIsSaving(true);
    try {
      const cardId = editing?.id ?? newCardId();
      const baseSealed = {
        issuer,
        name: hasName ? name : null,
        dueDay: formData.dueDay,
        lastFour: formData.hasNoLastFour ? null : formData.lastFour || null,
        payFromAccountId:
          pullAccounts.length >= 2
            ? payFromAccountId
            : (editing?.payFromAccountId ?? null),
      };
      const feeResult = getFeePlan(store.getState(), {
        cardId,
        cardName: getCardName(
          {
            ...baseSealed,
            id: cardId,
            createdAt: editing?.createdAt ?? Date.now(),
            updatedAt: editing?.updatedAt ?? Date.now(),
            archivedAt: null,
            linkId: editing?.linkId ?? null,
            annualFee: null,
          },
          cards,
        ),
        before: feeBefore,
        after: feeAfter,
        heldChoice: asksFeeHeld ? formData.feeHeld : null,
        today,
      });
      if (feeResult.kind === 'loading') {
        setError(CARD_FEE_WORDS.loading);
        setIsSaving(false);
        return;
      }
      const sealed = { ...baseSealed, annualFee: feeResult.annualFee };
      const encryption = await getRunwayEncryption(user.uid);
      if (editing) {
        const summary = describeCardChanged(
          getCardName(editing, cards),
          editing,
          sealed,
          (id) =>
            allAccounts.find((account) => account.id === id)?.name ??
            CARD_WORDS.payFromNone,
          today,
        );
        const changeSummary = summary ?? feeResult.plan?.summary ?? null;
        if (changeSummary !== null) {
          await updateCard(
            user.uid,
            encryption,
            editing.id,
            sealed,
            changeSummary,
            { fee: feeResult.plan, seenUpdatedAt: openedAt },
          );
          addToast({
            title: CARD_WORDS.saved(
              getCardName({ ...editing, ...sealed }, cards),
            ),
            type: 'success',
          });
        }
        onClose();
        return;
      }
      const owedNow = asksOwed ? (owedCents ?? 0) : 0;
      const id = await createCard(
        user.uid,
        encryption,
        { ...sealed, owedCents: owedNow },
        describeCardAdded(
          getCardName(
            {
              ...sealed,
              id: '',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              archivedAt: null,
              linkId: null,
            },
            cards,
          ),
          owedNow,
        ),
        { id: cardId, fee: feeResult.plan },
      );
      addToast({
        title: CARD_WORDS.added(
          getCardName(
            {
              ...sealed,
              id,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              archivedAt: null,
              linkId: null,
            },
            cards,
          ),
        ),
        type: 'success',
      });
      onClose();
    } catch (saveError) {
      if (isMounted.current) {
        setError(
          isOfflineFailure(saveError)
            ? CARD_WORDS.offline
            : getErrorMessage(saveError, CARD_WORDS.failed),
        );
        setIsSaving(false);
      }
    }
  };

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={CARD_WORDS.sheetTitle}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-5'>
        {draft.isNoticeShown && (
          <DraftRestoredNotice
            onStartOver={startOver}
            onDismiss={draft.hideNotice}
          />
        )}
        <QuestionFlow flow={questions} />
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
                {editing ? CARD_WORDS.save : CARD_WORDS.saveAdd}
              </Button>
            )
          }
        />
      </div>
    </FormSheet>
  );
}

const CardForm = withStartOver(CardFormBody);

export default CardForm;
