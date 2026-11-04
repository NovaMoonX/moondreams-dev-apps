import { useEffect, useRef, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AmountHero from '@/components/AmountHero';
import DraftRestoredNotice from '@/components/DraftRestoredNotice';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import QuestionFlow from '@/components/QuestionFlow';
import RevealChip from '@/components/RevealChip';
import SuggestionChips from '@/components/SuggestionChips';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useFormDraft, useKeepFormDraft } from '@/hooks/useFormDraft';
import { useQuestionFlow, type QuestionStep } from '@/hooks/useQuestionFlow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { clearFormDraft } from '@lib/app/formDrafts';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents, parseMoneyToCents } from '@/utils/moneyUtils';
import {
  ACCOUNT_KINDS,
  ACCOUNT_KINDS_LEFT_OUT,
  ACCOUNT_KIND_LABELS,
  ACCOUNT_WORDS,
  FORM_DRAFT_PREFIX,
  FORM_FLOW_WORDS,
  MAX_NAME_LENGTH,
  MAX_PURCHASE_CENTS,
} from '@apps/runway/constants';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import LastFourField from '@apps/runway/forms/LastFourField';
import {
  isFlag,
  isOneOf,
  isText,
  readDraftFields,
  type Check,
} from '@apps/runway/forms/draftParse';
import {
  withStartOver,
  type StartOverProps,
} from '@apps/runway/forms/withStartOver';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  createAccount,
  updateAccount,
} from '@apps/runway/store/actions/accountActions';
import {
  selectAllAccounts,
  selectAllCards,
} from '@apps/runway/store/selectors/runwaySelectors';
import type {
  AccountKind,
  AccountSealed,
  OpenAccount,
} from '@apps/runway/types';
import {
  describeAccountChanged,
  isLastFour,
} from '@apps/runway/utils/accountText';
import { resolveBank } from '@apps/runway/utils/cardText';
import { maskSummaries } from '@apps/runway/utils/maskSummaries';

interface AccountFormData {
  institution: string;
  name: string;
  kind: AccountKind;
  lastFour: string;
  hasNoLastFour: boolean;
  /** Null until answered; only a checking account is asked. */
  isPull: boolean | null;
  balance: string;
}

interface AccountFormProps {
  isOpen: boolean;
  onClose: () => void;
  /** Where Cancel and Discard go, when that is not where a save goes. */
  onCancel?: () => void;
  /** The account being changed. */
  editing?: OpenAccount;
}

const isNullableFlag: Check = (value) =>
  value === null || typeof value === 'boolean';

const isOfflineFailure = (error: unknown) =>
  !navigator.onLine ||
  /offline|unavailable/i.test(error instanceof Error ? error.message : '');

const parseAccountDraft = (stored: unknown) => {
  const fields =
    typeof stored === 'object' && stored !== null
      ? Object.fromEntries(
          Object.entries(stored).filter(([key]) => key !== 'isCounted'),
        )
      : stored;
  return readDraftFields<AccountFormData>(fields, {
    institution: isText,
    name: isText,
    kind: isOneOf(ACCOUNT_KINDS),
    lastFour: isText,
    hasNoLastFour: isFlag,
    isPull: isNullableFlag,
    balance: isText,
  });
};

const getInitialData = (editing: OpenAccount | undefined): AccountFormData =>
  editing
    ? {
        institution: editing.institution,
        name: editing.name,
        kind: editing.kind,
        lastFour: editing.lastFour ?? '',
        hasNoLastFour: editing.lastFour === null,
        isPull: editing.isPullAccount,
        balance: '',
      }
    : {
        institution: '',
        name: '',
        kind: 'checking',
        lastFour: '',
        hasNoLastFour: false,
        isPull: null,
        balance: '',
      };

const kindOptions = ACCOUNT_KINDS.map((value) => ({
  value,
  label: ACCOUNT_KIND_LABELS[value],
}));
const YES = 'yes';
const NO = 'no';

/** Adds an account, or changes its bank, name, kind, last 4 digits and whether cards and bills pull from it and it counts in the total. Adding can also say what it holds today. */
function AccountFormBody({
  isOpen,
  onClose,
  onCancel,
  editing,
  onStartOver,
}: AccountFormProps & StartOverProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const { isHidden } = useValuesHidden();
  const isMounted = useRef(true);
  const cards = useAppSelector(selectAllCards);
  const accounts = useAppSelector(selectAllAccounts);
  const [startData] = useState(() => getInitialData(editing));
  const draftKey = `${FORM_DRAFT_PREFIX}account:${editing?.id ?? 'new'}`;
  const draftBase = editing ? startData : null;
  const draft = useFormDraft({
    key: draftKey,
    base: draftBase,
    parse: parseAccountDraft,
  });
  const [formData, setFormData] = useState<AccountFormData>(
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

  const set = (patch: Partial<AccountFormData>) =>
    setFormData((current) => ({ ...current, ...patch }));

  const usedBanks = Array.from(
    new Map(
      [
        ...cards.map((card) => card.issuer),
        ...accounts.map((account) => account.institution),
      ]
        .filter((bank) => bank.trim() !== '')
        .map((bank) => [bank.toLowerCase(), bank] as const),
    ).values(),
  );
  const typedInstitution = formData.institution.trim();
  const institution =
    typedInstitution === ''
      ? ''
      : typedInstitution === editing?.institution
        ? typedInstitution
        : resolveBank(typedInstitution, usedBanks);
  const name = formData.name.trim();
  const isCheckingAsked = formData.kind === 'checking';
  const isPull = isCheckingAsked ? formData.isPull : (formData.isPull ?? false);
  const isCounted =
    editing && formData.kind === editing.kind
      ? editing.countedTowardTotal
      : !ACCOUNT_KINDS_LEFT_OUT.includes(formData.kind);
  const lastFour = formData.hasNoLastFour ? null : formData.lastFour;
  const isLastFourAnswered =
    formData.hasNoLastFour || isLastFour(formData.lastFour);
  const balanceText = formData.balance.trim();
  const balanceCents =
    balanceText === '' ? null : parseMoneyToCents(balanceText);
  const isBalanceValid =
    balanceText === '' ||
    (balanceCents !== null &&
      balanceCents >= 0 &&
      balanceCents <= MAX_PURCHASE_CENTS);
  const asksBalance = editing === undefined;

  const steps: QuestionStep[] = [
    {
      id: 'institution',
      title: ACCOUNT_WORDS.institutionTitle,
      summaryLabel: ACCOUNT_WORDS.institutionLabel,
      summaryValue: institution,
      isAnswered: institution !== '',
      blocker: ACCOUNT_WORDS.needsInstitution,
      render: ({ moveOn }) => (
        <div className='space-y-3'>
          <Input
            variant='outline'
            aria-label={ACCOUNT_WORDS.institutionLabel}
            placeholder={ACCOUNT_WORDS.institutionPlaceholder}
            maxLength={MAX_NAME_LENGTH}
            value={formData.institution}
            onChange={(event) => set({ institution: event.target.value })}
          />
          {usedBanks.length > 0 && (
            <SuggestionChips
              label={ACCOUNT_WORDS.institutionsUsed}
              suggestions={usedBanks}
              onPick={(bank) => {
                set({ institution: bank });
                moveOn();
              }}
            />
          )}
        </div>
      ),
    },
    {
      id: 'name',
      title: ACCOUNT_WORDS.nameTitle,
      summaryLabel: ACCOUNT_WORDS.nameLabel,
      summaryValue: name,
      isAnswered: name !== '',
      blocker: ACCOUNT_WORDS.needsName,
      render: () => (
        <Input
          variant='outline'
          aria-label={ACCOUNT_WORDS.nameLabel}
          placeholder={ACCOUNT_WORDS.namePlaceholder}
          maxLength={MAX_NAME_LENGTH}
          value={formData.name}
          onChange={(event) => set({ name: event.target.value })}
        />
      ),
    },
    {
      id: 'kind',
      title: ACCOUNT_WORDS.kindTitle,
      summaryLabel: ACCOUNT_WORDS.kindLabel,
      summaryValue: ACCOUNT_KIND_LABELS[formData.kind],
      isAnswered: true,
      render: ({ moveOn }) => (
        <PillGroup
          label={ACCOUNT_WORDS.kindLabel}
          options={kindOptions}
          value={formData.kind}
          onChange={(kind) => {
            set({ kind });
            moveOn();
          }}
        />
      ),
    },
    {
      id: 'lastFour',
      title: ACCOUNT_WORDS.lastFourTitle,
      summaryLabel: ACCOUNT_WORDS.lastFourLabel,
      summaryValue: formData.hasNoLastFour
        ? ACCOUNT_WORDS.lastFourNone
        : isLastFour(formData.lastFour)
          ? `••${formData.lastFour}`
          : '',
      isAnswered: isLastFourAnswered,
      blocker: ACCOUNT_WORDS.needsFourDigits,
      render: ({ moveOn }) => (
        <LastFourField
          label={ACCOUNT_WORDS.lastFourLabel}
          hint={ACCOUNT_WORDS.lastFourHint}
          skipLabel={ACCOUNT_WORDS.lastFourSkip}
          value={formData.lastFour}
          onChange={(value) => set({ lastFour: value, hasNoLastFour: false })}
          onSkip={() => {
            set({ lastFour: '', hasNoLastFour: true });
            moveOn();
          }}
        />
      ),
    },
    {
      id: 'pull',
      title: ACCOUNT_WORDS.pullTitle,
      summaryLabel: ACCOUNT_WORDS.pullLabel,
      summaryValue:
        isPull === null
          ? ''
          : isPull
            ? ACCOUNT_WORDS.pullYes
            : ACCOUNT_WORDS.pullNo,
      isAnswered: isPull !== null,
      isPreAnswered: !isCheckingAsked,
      blocker: ACCOUNT_WORDS.needsPull,
      render: ({ moveOn }) => (
        <PillGroup
          label={ACCOUNT_WORDS.pullLabel}
          options={[
            { value: YES, label: ACCOUNT_WORDS.pullYes },
            { value: NO, label: ACCOUNT_WORDS.pullNo },
          ]}
          value={isPull === null ? null : isPull ? YES : NO}
          onChange={(value) => {
            set({ isPull: value === YES });
            moveOn();
          }}
        />
      ),
    },
    ...(asksBalance
      ? [
          {
            id: 'balance',
            title: ACCOUNT_WORDS.balanceTitle,
            summaryLabel: ACCOUNT_WORDS.balanceLabel,
            summaryValue:
              balanceCents === null
                ? ACCOUNT_WORDS.balanceNotNow
                : formatCents(balanceCents),
            isAnswered: isBalanceValid,
            blocker: ACCOUNT_WORDS.balanceNeeded,
            render: ({ moveOn }) => (
              <div className='space-y-3'>
                <AmountHero
                  label={ACCOUNT_WORDS.balanceLabel}
                  value={formData.balance}
                  onChange={(balance) => set({ balance })}
                  hint={ACCOUNT_WORDS.balanceHint}
                  disabled={isSaving}
                />
                <div className='text-center'>
                  <RevealChip
                    onClick={() => {
                      set({ balance: '' });
                      moveOn();
                    }}
                  >
                    {ACCOUNT_WORDS.balanceNotNow}
                  </RevealChip>
                </div>
              </div>
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
      : FORM_FLOW_WORDS.discardNew(ACCOUNT_WORDS.discardNew),
  });
  const getBlocker = () =>
    institution === ''
      ? ACCOUNT_WORDS.needsInstitution
      : name === ''
        ? ACCOUNT_WORDS.needsName
        : !isLastFourAnswered
          ? ACCOUNT_WORDS.needsFourDigits
          : isPull === null
            ? ACCOUNT_WORDS.needsPull
            : !isBalanceValid
              ? ACCOUNT_WORDS.balanceNeeded
              : null;
  const blocker = getBlocker();
  const shownNote = isAsking ? questions.blocker : blocker;

  const handleSave = async () => {
    if (!user || blocker !== null || isPull === null) return;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const sealed: AccountSealed = {
        name,
        institution,
        kind: formData.kind,
        countedTowardTotal: isCounted,
        isPullAccount: isPull,
        lastFour: lastFour === null || lastFour === '' ? null : lastFour,
        balanceCents: editing ? editing.balanceCents : balanceCents,
        balanceOn: editing
          ? editing.balanceOn
          : balanceCents === null
            ? null
            : todayAsUtcDate(),
        holds: editing ? editing.holds : [],
      };
      if (editing) {
        const summary = describeAccountChanged(editing, sealed);
        if (summary !== null) {
          await updateAccount(
            user.uid,
            encryption,
            editing.id,
            sealed,
            summary,
          );
          addToast({ title: ACCOUNT_WORDS.saved(name), type: 'success' });
        }
        onClose();
        return;
      }
      await createAccount(user.uid, encryption, sealed);
      addToast({ title: ACCOUNT_WORDS.added(name), type: 'success' });
      onClose();
    } catch (saveError) {
      if (isMounted.current) {
        setError(
          isOfflineFailure(saveError)
            ? ACCOUNT_WORDS.offline
            : getErrorMessage(saveError, ACCOUNT_WORDS.saveFailed),
        );
        setIsSaving(false);
      }
    }
  };

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={editing ? ACCOUNT_WORDS.sheetTitle : ACCOUNT_WORDS.sheetTitleNew}
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
          note={error ?? (shownNote ? mask(shownNote) : null)}
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
                {editing ? ACCOUNT_WORDS.save : ACCOUNT_WORDS.saveAdd}
              </Button>
            )
          }
        />
      </div>
    </FormSheet>
  );
}

const AccountForm = withStartOver(AccountFormBody);

export default AccountForm;
