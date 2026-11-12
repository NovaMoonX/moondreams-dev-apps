import { useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  CalendarDays,
  CreditCard,
  FolderInput,
  Layers,
  Wallet,
} from 'lucide-react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import Pill from '@/components/Pill';
import SectionHeader from '@/components/SectionHeader';
import SelectionBar from '@/components/SelectionBar';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import HeldChoiceList from '@apps/runway/components/HeldChoiceList';
import ItemRow from '@apps/runway/components/ItemRow';
import { MaskedText } from '@apps/runway/components/MaskedText';
import MonthDayGrid from '@apps/runway/components/MonthDayGrid';
import {
  ACCOUNT_WORDS,
  AUTO_PAY_WORDS,
  BILL_PAY_WORDS,
  FORM_FLOW_WORDS,
  HELD_WORDS,
  PAID_FROM_WORDS,
  PLAN_SELECT_WORDS,
  PRIORITIES,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import { getPullAccounts } from '@apps/runway/engine/accounts';
import { getBillPins } from '@apps/runway/engine/billShare';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import type { HeldChoice } from '@apps/runway/engine/endings';
import { isTrackingLevel } from '@apps/runway/engine/level';
import { getNextTierRank } from '@apps/runway/engine/priorities';
import {
  readStretches,
  usePlanBulk,
  type BulkPlan,
} from '@apps/runway/hooks/usePlanBulk';
import { isCardFeeBill, isCardFeeGroup } from '@apps/runway/engine/cardFees';
import { canPayOnSchedule } from '@apps/runway/engine/schedule';
import type { SelectView } from '@apps/runway/hooks/usePlanSelection';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { archiveItem } from '@apps/runway/store/actions/itemActions';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectAccounts,
  selectAllCards,
  selectBills,
  selectEnvelopes,
  selectGoals,
  selectGroups,
  selectHeldByItem,
  selectPurposeEmojis,
} from '@apps/runway/store/selectors/runwaySelectors';
import type {
  BillSealed,
  EnvelopeSealed,
  GoalSealed,
  Priority,
} from '@apps/runway/types';
import { describePayOnDay } from '@apps/runway/utils/billText';
import { getCardName } from '@apps/runway/utils/cardText';
import { planGroupPriority } from '@apps/runway/utils/groupPriority';

type MemberPayload = BillSealed | EnvelopeSealed | GoalSealed;
type Sheet =
  'menu' | 'payOn' | 'paidFrom' | 'paidWith' | 'priority' | 'group' | 'archive';

const NO_PAY_WAY = 'none';
const LEAVE = 'leave';

/** A day of the month to pay on means something only for a dated bill paid at most once a month. */
const canPayOnDay = (payload: MemberPayload) =>
  'timing' in payload &&
  payload.timing.schedule.anchor !== null &&
  canPayOnSchedule(payload.timing.schedule) &&
  !isCardFeeBill(payload);

/** A card's annual fee bill follows its card: only its priority and Paid from change here. */
const isFeeBill = (payload: MemberPayload) =>
  'timing' in payload && isCardFeeBill(payload);

export interface TickedItem {
  itemId: string;
  name: string;
  payload: MemberPayload;
}

interface PlanBulkActionsProps {
  view: SelectView;
  ticked: readonly TickedItem[];
  /** Called after a save with the ids that saved; what did not save stays ticked. */
  onSaved: (savedIds: string[], failedIds: string[]) => void;
}

/** The pinned bar of a Plan view while several of its items are ticked, and the small sheet each of its changes opens. */
function PlanBulkActions({ view, ticked, onSaved }: PlanBulkActionsProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const bulk = usePlanBulk(view);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const archivingRef = useRef(false);
  const isTracking = isTrackingLevel(useAppSelector(selectLevel));
  const allCards = useAppSelector(selectAllCards);
  const accounts = useAppSelector(selectAccounts);
  const heldByItem = useAppSelector(selectHeldByItem);
  const count = ticked.length;
  const noun = bulk.noun;
  const isNothing = count === 0;
  const isBills = view === 'bills';
  const shownCards = isTracking
    ? allCards.filter((card) => card.archivedAt === null)
    : [];
  const pullAccounts = getPullAccounts(accounts);
  const shownAccounts = pullAccounts.length >= 2 ? pullAccounts : [];
  const hasPaidWith = isTracking || shownAccounts.length > 0;

  const close = () => setSheet(null);
  const backToMenu = () => setSheet('menu');

  const save = async (
    plans: readonly BulkPlan[],
    options: { clearsPins?: boolean } = {},
  ) => {
    if (plans.length === 0) {
      addToast({ title: PLAN_SELECT_WORDS.nothingChanges, type: 'info' });
      close();
      return;
    }
    const failed = await bulk.run(plans, options);
    if (failed === null) return;
    const tickedIds = ticked.map(({ itemId }) => itemId);
    close();
    onSaved(
      tickedIds.filter((id) => !failed.includes(id)),
      failed,
    );
  };

  const changeable = ticked.filter(({ payload }) => !isFeeBill(payload));
  const feeNames = ticked
    .filter(({ payload }) => isFeeBill(payload))
    .map(({ name }) => name);
  const feeNote =
    feeNames.length > 0 ? (
      <p className='text-muted-foreground text-sm'>
        {PLAN_SELECT_WORDS.feeSkipped(feeNames)}
      </p>
    ) : null;
  const applyToAll = (change: (payload: MemberPayload) => MemberPayload) =>
    bulk.plan(ticked, change);
  const applyToChangeable = (
    change: (payload: MemberPayload) => MemberPayload,
  ) => bulk.plan(changeable, change);

  const archive = async (heldChoice: HeldChoice | null) => {
    if (!user || archivingRef.current) return;
    archivingRef.current = true;
    setIsArchiving(true);
    const today = todayAsUtcDate();
    const encryption = await getRunwayEncryption(user.uid).catch(() => null);
    const results = encryption
      ? await Promise.allSettled(
          changeable.map(({ itemId, name }) =>
            archiveItem(
              user.uid,
              encryption,
              {
                itemId,
                summary: `${name}: archived.`,
                note: null,
                heldChoice: (heldByItem[itemId] ?? 0) > 0 ? heldChoice : null,
              },
              today,
            ),
          ),
        )
      : changeable.map(
          () => ({ status: 'rejected', reason: null }) as PromiseRejectedResult,
        );
    archivingRef.current = false;
    setIsArchiving(false);
    const failed = changeable.filter(
      (_, index) => results[index].status === 'rejected',
    );
    const done = changeable.length - failed.length;
    addToast({
      title:
        failed.length === 0
          ? PLAN_SELECT_WORDS.archived(done, noun)
          : done === 0
            ? PLAN_SELECT_WORDS.failed
            : PLAN_SELECT_WORDS.archivedPartly(
                done,
                changeable.length,
                failed.map(({ name }) => name),
              ),
      type: failed.length === 0 ? 'success' : done === 0 ? 'error' : 'warning',
    });
    close();
    onSaved(
      ticked
        .filter((item) => !failed.includes(item))
        .map(({ itemId }) => itemId),
      failed.map(({ itemId }) => itemId),
    );
  };

  const menuRows = [
    ...(isBills
      ? [
          {
            key: 'payOn' as const,
            icon: <CalendarDays />,
            label: PLAN_SELECT_WORDS.payOn,
            subtitle: PLAN_SELECT_WORDS.payOnSub,
          },
          {
            key: 'paidFrom' as const,
            icon: <Wallet />,
            label: PLAN_SELECT_WORDS.paidFrom,
            subtitle: PLAN_SELECT_WORDS.paidFromSub,
          },
          ...(hasPaidWith
            ? [
                {
                  key: 'paidWith' as const,
                  icon: <CreditCard />,
                  label: PLAN_SELECT_WORDS.paidWith,
                  subtitle: PLAN_SELECT_WORDS.paidWithSub,
                },
              ]
            : []),
        ]
      : []),
    {
      key: 'priority' as const,
      icon: <Layers />,
      label: PLAN_SELECT_WORDS.priority,
      subtitle: PLAN_SELECT_WORDS.prioritySub,
    },
    {
      key: 'group' as const,
      icon: <FolderInput />,
      label: PLAN_SELECT_WORDS.group,
      subtitle: PLAN_SELECT_WORDS.groupSub,
    },
  ];

  return (
    <>
      <SelectionBar
        note={
          isNothing
            ? PLAN_SELECT_WORDS.nothing(noun)
            : changeable.length === 0
              ? PLAN_SELECT_WORDS.feeOnly
              : null
        }
        actions={[
          {
            key: 'archive',
            label: PLAN_SELECT_WORDS.archive,
            icon: <Archive className='h-4 w-4' aria-hidden='true' />,
            isDestructive: true,
            isDisabled: changeable.length === 0 || bulk.isWriting,
            onClick: () => setSheet('archive'),
          },
        ]}
        primary={{
          key: 'change',
          label: PLAN_SELECT_WORDS.change,
          isDisabled: isNothing,
          isLoading: bulk.isWriting,
          onClick: () => setSheet('menu'),
        }}
      />
      {sheet === 'menu' && (
        <FormSheet
          isOpen
          isDrawerWhenShort
          onClose={close}
          title={PLAN_SELECT_WORDS.changeTitle(count, noun)}
        >
          <div className='space-y-1 pb-4'>
            {menuRows.map((row) => (
              <ActionRow
                key={row.key}
                icon={row.icon}
                label={row.label}
                subtitle={row.subtitle}
                hasChevron
                onClick={() => setSheet(row.key)}
              />
            ))}
          </div>
        </FormSheet>
      )}
      {sheet === 'payOn' && (
        <PayOnSheet
          ticked={ticked}
          isSaving={bulk.isWriting}
          onClose={backToMenu}
          onSave={(payOnDay) =>
            void save(
              applyToAll((payload) =>
                canPayOnDay(payload) ? { ...payload, payOnDay } : payload,
              ),
            )
          }
        />
      )}
      {sheet === 'paidFrom' && (
        <PaidFromSheet
          ticked={ticked}
          isSaving={bulk.isWriting}
          onClose={backToMenu}
          onSave={(kind) =>
            void save(
              applyToAll((payload) =>
                'fundedBy' in payload
                  ? { ...payload, fundedBy: { kind } }
                  : payload,
              ),
              { clearsPins: true },
            )
          }
        />
      )}
      {sheet === 'paidWith' && (
        <SmallSheet
          title={PLAN_SELECT_WORDS.paidWithTitle}
          sheetTitle={PLAN_SELECT_WORDS.paidWith}
          onClose={backToMenu}
        >
          {feeNote}
          <PaidWithBody
            cards={shownCards.map((card) => ({
              value: card.id,
              label: getCardName(card, allCards),
              detail: BILL_PAY_WORDS.cardDetail,
            }))}
            accounts={shownAccounts.map((account) => ({
              value: account.id,
              label: account.name,
            }))}
            isTracking={isTracking}
            isSaving={bulk.isWriting}
            onClose={backToMenu}
            onSave={(payWay, paysItself) =>
              void save(
                applyToChangeable((payload) => {
                  if (!('timing' in payload)) return payload;
                  const isCard = shownCards.some(({ id }) => id === payWay);
                  const isAccount = shownAccounts.some(
                    ({ id }) => id === payWay,
                  );
                  return {
                    ...payload,
                    ...(payWay !== null && isTracking
                      ? { paidByCardId: isCard ? payWay : null }
                      : {}),
                    ...(payWay !== null && shownAccounts.length > 0
                      ? { accountId: isAccount ? payWay : null }
                      : {}),
                    ...(paysItself === null ? {} : { paysItself }),
                  };
                }),
              )
            }
          />
        </SmallSheet>
      )}
      {sheet === 'priority' && (
        <PrioritySheet
          view={view}
          ticked={ticked}
          isSaving={bulk.isWriting}
          onClose={backToMenu}
          onSave={(plans) => void save(plans)}
        />
      )}
      {sheet === 'group' && (
        <GroupPickSheet
          feeNote={feeNote}
          onClose={backToMenu}
          onPick={(groupId) =>
            void save(
              applyToChangeable((payload) => ({
                ...payload,
                groupId,
              })),
            )
          }
        />
      )}
      {sheet === 'archive' && (
        <ArchiveSheet
          view={view}
          ticked={changeable}
          feeNote={feeNote}
          heldByItem={heldByItem}
          isSaving={isArchiving}
          onClose={close}
          onArchive={(choice) => void archive(choice)}
        />
      )}
    </>
  );
}

function SmallSheet({
  title,
  sheetTitle,
  onClose,
  children,
}: {
  title: string;
  sheetTitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <FormSheet isOpen isDrawerWhenShort onClose={onClose} title={sheetTitle}>
      <div className='space-y-4'>
        <h3 className='text-2xl font-semibold'>{title}</h3>
        {children}
      </div>
    </FormSheet>
  );
}

function Footer({
  note,
  isDisabled,
  isSaving,
  onClose,
  onSave,
}: {
  note?: string | null;
  isDisabled: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <ModalFooterActions
      note={note}
      cancelAction={
        <Button type='button' variant='secondary' onClick={onClose}>
          Cancel
        </Button>
      }
      rightActions={
        <Button
          type='button'
          disabled={isDisabled}
          loading={isSaving}
          onClick={onSave}
        >
          {PLAN_SELECT_WORDS.save}
        </Button>
      }
    />
  );
}

function PayOnSheet({
  ticked,
  isSaving,
  onClose,
  onSave,
}: {
  ticked: readonly TickedItem[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (payOnDay: number | null) => void;
}) {
  const [mode, setMode] = useState<'due' | 'day' | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const skipped = ticked
    .filter(({ payload }) => !canPayOnDay(payload))
    .map(({ name }) => name);
  const isReady = mode === 'due' || (mode === 'day' && day !== null);

  return (
    <SmallSheet
      title={PLAN_SELECT_WORDS.payOnTitle}
      sheetTitle={PLAN_SELECT_WORDS.payOn}
      onClose={onClose}
    >
      <PillGroup
        label={PLAN_SELECT_WORDS.payOnTitle}
        options={[
          { value: 'due', label: FORM_FLOW_WORDS.payOnDue },
          { value: 'day', label: FORM_FLOW_WORDS.payOnSetDay },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'day' && (
        <MonthDayGrid
          label={FORM_FLOW_WORDS.payOnDayLabel}
          value={day}
          onPick={setDay}
        />
      )}
      {mode === 'day' && day !== null && (
        <p className='text-muted-foreground text-sm'>{describePayOnDay(day)}</p>
      )}
      {skipped.length > 0 && (
        <p className='text-muted-foreground text-sm'>
          {PLAN_SELECT_WORDS.payOnSkipped(skipped)}
        </p>
      )}
      <Footer
        isDisabled={!isReady}
        note={!isReady ? PLAN_SELECT_WORDS.pickToContinue : null}
        isSaving={isSaving}
        onClose={onClose}
        onSave={() => onSave(mode === 'day' ? day : null)}
      />
    </SmallSheet>
  );
}

function PaidFromSheet({
  ticked,
  isSaving,
  onClose,
  onSave,
}: {
  ticked: readonly TickedItem[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (kind: 'suggested' | 'lastBefore') => void;
}) {
  const [kind, setKind] = useState<'suggested' | 'lastBefore' | null>(null);
  const days = useAppSelector((state) => state.runway.days);
  const today = todayAsUtcDate();
  const pinCount =
    kind === null
      ? 0
      : ticked
          .filter(
            ({ payload }) =>
              'fundedBy' in payload && payload.fundedBy.kind !== kind,
          )
          .reduce(
            (sum, { itemId }) => sum + getBillPins(days, itemId, today).length,
            0,
          );

  return (
    <SmallSheet
      title={PLAN_SELECT_WORDS.paidFromTitle}
      sheetTitle={PLAN_SELECT_WORDS.paidFrom}
      onClose={onClose}
    >
      <PillGroup
        label={PLAN_SELECT_WORDS.paidFromTitle}
        options={[
          {
            value: 'suggested',
            label: PAID_FROM_WORDS.spread,
            detail: PAID_FROM_WORDS.spreadMeaning,
          },
          {
            value: 'lastBefore',
            label: PAID_FROM_WORDS.lastBefore,
            detail: PAID_FROM_WORDS.lastBeforeMeaning,
          },
        ]}
        value={kind}
        onChange={setKind}
      />
      <Footer
        note={
          kind === null
            ? PLAN_SELECT_WORDS.pickToContinue
            : pinCount > 0
              ? PLAN_SELECT_WORDS.paidFromPinsNote(pinCount)
              : null
        }
        isDisabled={kind === null}
        isSaving={isSaving}
        onClose={onClose}
        onSave={() => kind && onSave(kind)}
      />
    </SmallSheet>
  );
}

function PaidWithBody({
  cards,
  accounts,
  isTracking,
  isSaving,
  onClose,
  onSave,
}: {
  cards: { value: string; label: string; detail: string }[];
  accounts: { value: string; label: string }[];
  isTracking: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (payWay: string | null, paysItself: boolean | null) => void;
}) {
  const [payWay, setPayWay] = useState<string>(LEAVE);
  const [paysItself, setPaysItself] = useState<string>(LEAVE);
  const hasWays = cards.length > 0 || accounts.length > 0;
  const isReady = payWay !== LEAVE || paysItself !== LEAVE;

  return (
    <>
      {hasWays && (
        <div className='[&_button]:min-h-10!'>
          <PillGroup
            label={BILL_PAY_WORDS.label}
            options={[
              { value: LEAVE, label: PLAN_SELECT_WORDS.leaveEach },
              {
                value: NO_PAY_WAY,
                label:
                  accounts.length > 0
                    ? ACCOUNT_WORDS.payFromNone
                    : BILL_PAY_WORDS.fromBank,
              },
              ...cards,
              ...accounts,
            ]}
            value={payWay}
            onChange={setPayWay}
          />
        </div>
      )}
      {isTracking && (
        <PillGroup
          label={AUTO_PAY_WORDS.formToggle}
          options={[
            { value: LEAVE, label: PLAN_SELECT_WORDS.leaveEach },
            {
              value: 'on',
              label: PLAN_SELECT_WORDS.paysItselfOn,
              detail: AUTO_PAY_WORDS.formLine,
            },
            { value: 'off', label: PLAN_SELECT_WORDS.paysItselfOff },
          ]}
          value={paysItself}
          onChange={setPaysItself}
        />
      )}
      <Footer
        isDisabled={!isReady}
        note={!isReady ? PLAN_SELECT_WORDS.pickToContinue : null}
        isSaving={isSaving}
        onClose={onClose}
        onSave={() =>
          onSave(
            payWay === LEAVE ? null : payWay,
            paysItself === LEAVE ? null : paysItself === 'on',
          )
        }
      />
    </>
  );
}

function PrioritySheet({
  view,
  ticked,
  isSaving,
  onClose,
  onSave,
}: {
  view: SelectView;
  ticked: readonly TickedItem[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (plans: BulkPlan[]) => void;
}) {
  const [choice, setChoice] = useState<Priority | null>(null);
  const kind =
    view === 'bills' ? 'bill' : view === 'envelopes' ? 'envelope' : 'goal';
  const planFor = (priority: Priority): BulkPlan[] => {
    const today = todayAsUtcDate();
    const state = store.getState();
    const firstRank = getNextTierRank(
      [
        ...selectBills(state, today),
        ...selectEnvelopes(state, today),
        ...selectGoals(state, today),
      ],
      priority,
    );
    return planGroupPriority(
      ticked.map(({ itemId, name }) => ({
        itemId,
        name,
        kind,
        stretches: readStretches(kind, itemId, today),
      })),
      priority,
      firstRank,
    ).map((change) => ({
      itemId: change.itemId,
      name: change.name,
      original: change.stretches.filter((stretch) =>
        change.written.some(
          ({ effectiveFrom }) => effectiveFrom === stretch.effectiveFrom,
        ),
      ),
      written: change.written,
    }));
  };
  const folding =
    choice === null
      ? []
      : ticked
          .filter(
            ({ payload }) =>
              'extras' in payload && (payload.extras?.length ?? 0) > 0,
          )
          .map(({ name }) => name);

  return (
    <SmallSheet
      title={PLAN_SELECT_WORDS.priorityTitle}
      sheetTitle={PLAN_SELECT_WORDS.priority}
      onClose={onClose}
    >
      <PillGroup
        label={PLAN_SELECT_WORDS.priorityTitle}
        options={PRIORITIES.map((value) => ({
          value,
          label: PRIORITY_LABELS[value],
        }))}
        value={choice}
        onChange={setChoice}
      />
      {folding.length > 0 && (
        <p className='text-muted-foreground text-sm'>
          {PLAN_SELECT_WORDS.priorityFolds(folding)}
        </p>
      )}
      <Footer
        isDisabled={choice === null}
        note={choice === null ? PLAN_SELECT_WORDS.pickToContinue : null}
        isSaving={isSaving}
        onClose={onClose}
        onSave={() => choice && onSave(planFor(choice))}
      />
    </SmallSheet>
  );
}

function GroupPickSheet({
  feeNote,
  onClose,
  onPick,
}: {
  feeNote: ReactNode;
  onClose: () => void;
  onPick: (groupId: string | null) => void;
}) {
  const today = todayAsUtcDate();
  const groups = useAppSelector((state) => selectGroups(state, today));
  const emojis = useAppSelector(selectPurposeEmojis);

  return (
    <SmallSheet
      title={PLAN_SELECT_WORDS.groupTitle}
      sheetTitle={PLAN_SELECT_WORDS.group}
      onClose={onClose}
    >
      {feeNote}
      <ul className='border-border divide-border bg-card mb-4 max-h-[max(9rem,calc(92dvh-20rem))] divide-y overflow-y-auto rounded-2xl border'>
        {groups
          .filter(({ item }) => !isCardFeeGroup(item.id))
          .map(({ item, version }) => (
            <ItemRow
              key={item.id}
              name={version.payload.name}
              emoji={emojis.get(item.id) ?? null}
              isPrivate={false}
              ariaLabel={version.payload.name}
              isAction
              onOpen={() => onPick(item.id)}
            />
          ))}
        <ItemRow
          name={PLAN_SELECT_WORDS.noGroup}
          isPrivate={false}
          ariaLabel={PLAN_SELECT_WORDS.noGroup}
          isAction
          onOpen={() => onPick(null)}
        />
      </ul>
    </SmallSheet>
  );
}

function ArchiveSheet({
  view,
  ticked,
  feeNote,
  heldByItem,
  isSaving,
  onClose,
  onArchive,
}: {
  view: SelectView;
  ticked: readonly TickedItem[];
  feeNote: ReactNode;
  heldByItem: Record<string, number>;
  isSaving: boolean;
  onClose: () => void;
  onArchive: (choice: HeldChoice | null) => void;
}) {
  const [choice, setChoice] = useState<HeldChoice | null>(null);
  const noun = PLAN_SELECT_WORDS.noun[view];
  const holding = ticked.filter(({ itemId }) => (heldByItem[itemId] ?? 0) > 0);
  const heldCents = holding.reduce(
    (sum, { itemId }) => sum + (heldByItem[itemId] ?? 0),
    0,
  );
  const isAsking = holding.length > 0;

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={PLAN_SELECT_WORDS.archive}
    >
      <div className='space-y-4'>
        <div className='space-y-1'>
          <h3 className='text-2xl font-semibold'>
            {PLAN_SELECT_WORDS.archiveTitle(ticked.length, noun)}
          </h3>
          <p className='text-muted-foreground text-sm'>
            {PLAN_SELECT_WORDS.archiveBody(ticked.map(({ name }) => name))}
          </p>
        </div>
        {feeNote}
        {isAsking && (
          <div className='space-y-2'>
            <p className='text-muted-foreground text-xs'>
              <MaskedText>
                {PLAN_SELECT_WORDS.archiveHeld(
                  formatCents(heldCents),
                  holding.map(({ name }) => name),
                  ticked.length,
                )}
              </MaskedText>
            </p>
            <HeldChoiceList
              value={choice}
              onChange={setChoice}
              freeBody={HELD_WORDS.freeArchive}
              keepBody={HELD_WORDS.keepBody}
            />
          </div>
        )}
        <ModalFooterActions
          note={isAsking && choice === null ? HELD_WORDS.blocker : null}
          cancelAction={
            <Button type='button' variant='secondary' onClick={onClose}>
              Cancel
            </Button>
          }
          rightActions={
            <Button
              type='button'
              variant='destructive'
              disabled={isAsking && choice === null}
              loading={isSaving}
              onClick={() => onArchive(isAsking ? choice : null)}
            >
              {PLAN_SELECT_WORDS.archiveConfirm(ticked.length, noun)}
            </Button>
          }
        />
      </div>
    </FormSheet>
  );
}

interface PlanSelectHeaderProps {
  view: SelectView;
  tickedIds: readonly string[];
  /** Every item the view lists, for Select all. */
  allIds: readonly string[];
  onToggle: (ids: readonly string[]) => void;
  onDone: () => void;
}

/** A Plan view's title while several of its items are being picked: how many, Select all or Clear for the whole view, and Done. */
export function PlanSelectHeader({
  view,
  tickedIds,
  allIds,
  onToggle,
  onDone,
}: PlanSelectHeaderProps) {
  const count = tickedIds.length;
  const isAll = allIds.length > 0 && count === allIds.length;
  return (
    <>
      <SectionHeader
        title={PLAN_SELECT_WORDS.count(count, PLAN_SELECT_WORDS.noun[view])}
        action={
          <Button
            type='button'
            variant='secondary'
            size='sm'
            rounded='full'
            className="relative h-7 px-3 after:absolute after:-inset-1.5 after:content-['']"
            onClick={onDone}
          >
            {PLAN_SELECT_WORDS.done}
          </Button>
        }
      />
      <div
        role='group'
        aria-label={PLAN_SELECT_WORDS.hint}
        className='flex flex-wrap items-center gap-2'
      >
        {!isAll && (
          <Pill isThin isSelected={false} onClick={() => onToggle(allIds)}>
            {PLAN_SELECT_WORDS.selectAll}
          </Pill>
        )}
        {count > 0 && (
          <Pill isThin isSelected={false} onClick={() => onToggle(tickedIds)}>
            {PLAN_SELECT_WORDS.clearAll}
          </Pill>
        )}
      </div>
    </>
  );
}

export default PlanBulkActions;
