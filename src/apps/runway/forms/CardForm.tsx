import { useRef, useEffect, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AmountHero from '@/components/AmountHero';
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
import { useQuestionFlow, type QuestionStep } from '@/hooks/useQuestionFlow';
import { useAppSelector } from '@/store';
import { clearFormDraft } from '@lib/app/formDrafts';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents, parseMoneyToCents } from '@/utils/moneyUtils';
import {
  CARD_ISSUERS,
  CARD_WORDS,
  FORM_DRAFT_PREFIX,
  FORM_FLOW_WORDS,
  MAX_NAME_LENGTH,
  MAX_PURCHASE_CENTS,
} from '@apps/runway/constants';
import {
  isFlag,
  isNullableOneOf,
  isText,
  isWholeNumber,
  readDraftFields,
} from '@apps/runway/forms/draftParse';
import {
  withStartOver,
  type StartOverProps,
} from '@apps/runway/forms/withStartOver';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { createCard, updateCard } from '@apps/runway/store/actions/cardActions';
import { selectAllCards } from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenCard } from '@apps/runway/types';
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

const parseCardDraft = (stored: unknown) => {
  const data = readDraftFields<CardFormData>(stored, {
    issuerPick: isNullableOneOf([...CARD_ISSUERS, OTHER_VALUE]),
    otherIssuer: isText,
    name: isText,
    hasNoName: isFlag,
    owed: isText,
    dueDay: (value) =>
      value === null ||
      (isWholeNumber(value) && DUE_DAYS.includes(value as number)),
    hasNoDueDay: isFlag,
  });
  return data;
};

const getInitialData = (editing: OpenCard | undefined): CardFormData => {
  if (!editing) {
    return {
      issuerPick: null,
      otherIssuer: '',
      name: '',
      hasNoName: false,
      owed: '',
      dueDay: null,
      hasNoDueDay: false,
    };
  }
  const known = CARD_ISSUERS.find((issuer) => issuer === editing.issuer);
  return {
    issuerPick: known ?? OTHER_VALUE,
    otherIssuer: known ? '' : editing.issuer,
    name: editing.name ?? '',
    hasNoName: editing.name === null,
    owed: '',
    dueDay: editing.dueDay,
    hasNoDueDay: editing.dueDay === null,
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
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? null,
  );
  const [startData] = useState(() => getInitialData(editing));
  const draftKey = `${FORM_DRAFT_PREFIX}card:${editing?.id ?? 'new'}`;
  const draft = useFormDraft({
    key: draftKey,
    base: startData,
    parse: parseCardDraft,
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
  const hasOther = hasUnnamedCardFrom(issuer, cards, editing?.id ?? null);

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
  ];
  const questions = useQuestionFlow({
    steps: maskSummaries(steps, isHidden),
    startFolded: editing !== undefined || draft.restored !== null,
  });
  const isAsking = !questions.hasReviewed;
  const isDirty = JSON.stringify(formData) !== JSON.stringify(startData);
  useKeepFormDraft({
    isRestored: draft.restored !== null,
    key: draftKey,
    base: startData,
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
        : !isOwedValid
          ? FORM_FLOW_WORDS.badAmount
          : !isDueAnswered
            ? CARD_WORDS.needsDue
            : null;

  const handleSave = async () => {
    if (!user || blocker !== null) return;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const sealed = {
        issuer,
        name: hasName ? name : null,
        dueDay: formData.dueDay,
      };
      if (editing) {
        const summary = describeCardChanged(
          getCardName(editing, cards),
          editing,
          sealed,
        );
        if (summary !== null) {
          await updateCard(user.uid, encryption, editing.id, sealed, summary);
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
            },
            cards,
          ),
          owedNow,
        ),
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
