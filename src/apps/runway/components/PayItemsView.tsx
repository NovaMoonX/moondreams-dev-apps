import { useState, type ReactNode } from 'react';
import { ChevronsUp, Unlink } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import { useAppSelector } from '@/store';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import ChoiceCards from '@apps/runway/components/ChoiceCards';
import ItemRow from '@apps/runway/components/ItemRow';
import {
  PAY_ITEMS_WORDS,
  RUNWAY_SEARCH_THRESHOLD,
} from '@apps/runway/constants';
import {
  usePayMembers,
  type PayMember,
} from '@apps/runway/hooks/usePayMembers';
import { useLiveEmojiResolver } from '@apps/runway/hooks/useItemEmoji';
import { usePlanBulk } from '@apps/runway/hooks/usePlanBulk';
import {
  selectBillPayments,
  selectItemNames,
} from '@apps/runway/store/selectors/runwaySelectors';
import type {
  BillSealed,
  EnvelopeSealed,
  FundingPay,
  GoalSealed,
  Pairing,
} from '@apps/runway/types';
import {
  describeBillTiming,
  describeDueDay,
} from '@apps/runway/utils/billText';
import {
  describeAmount,
  describeFundingShort,
} from '@apps/runway/utils/fundingText';
import { listPayOptions, toDayWord } from '@apps/runway/utils/payFrom';

type Kind = PayMember['kind'];

interface Candidate {
  kind: Kind;
  itemId: string;
  name: string;
  emoji: string | null;
}

type Step =
  | { name: 'list' }
  | { name: 'action'; member: PayMember }
  | { name: 'add' }
  | { name: 'day'; candidate: Candidate };

interface PayItemsViewProps {
  itemId: string;
  kind: 'source' | 'payLine';
  name: string;
  today: number;
  pairings: readonly Pairing[];
  /** A one-time pay is never a rule's pay, so it shows only what it pays first. */
  isRepeating: boolean;
  onBack: () => void;
  onEditPairings: (initial: Pairing[]) => void;
}

const KIND_WORDS: Record<Kind, string> = {
  bill: PAY_ITEMS_WORDS.bill,
  envelope: PAY_ITEMS_WORDS.envelope,
  goal: PAY_ITEMS_WORDS.goal,
};

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

const matches = (name: string, query: string) =>
  name.toLowerCase().includes(query.trim().toLowerCase());

function PayItemsView({
  itemId,
  kind,
  name,
  today,
  pairings,
  isRepeating,
  onBack,
  onEditPairings,
}: PayItemsViewProps) {
  const { members, payLineIds, plan, bills, envelopes, goals } = usePayMembers(
    itemId,
    kind,
    today,
  );
  const billPayments = useAppSelector((state) =>
    selectBillPayments(state, today),
  );
  const itemNames = useAppSelector(selectItemNames);
  const emojiOf = useLiveEmojiResolver();
  const billBulk = usePlanBulk('bills');
  const envelopeBulk = usePlanBulk('envelopes');
  const goalBulk = usePlanBulk('goals');
  const [step, setStep] = useState<Step>({ name: 'list' });
  const [query, setQuery] = useState('');
  const [addQuery, setAddQuery] = useState('');
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  const options = listPayOptions(plan).filter((option) =>
    payLineIds.includes(option.fundedBy.payLineId),
  );
  const isSource = kind === 'source';
  const memberIds = new Set(members.map((member) => member.itemId));
  const pairedIds = new Set(pairings.map((pairing) => pairing.targetItemId));
  const tied = members.filter((member) => !pairedIds.has(member.itemId));

  const bulkOf = (itemKind: Kind) =>
    itemKind === 'bill'
      ? billBulk
      : itemKind === 'envelope'
        ? envelopeBulk
        : goalBulk;
  const isWriting =
    billBulk.isWriting || envelopeBulk.isWriting || goalBulk.isWriting;

  const nameOf = (id: string) =>
    [...bills, ...envelopes, ...goals].find(({ item }) => item.id === id)
      ?.version.payload.name ??
    itemNames.find((entry) => entry.id === id)?.name ??
    '';
  const emojiById = (id: string) => {
    const found = [...bills, ...envelopes, ...goals].find(
      ({ item }) => item.id === id,
    );
    if (!found) return null;
    const { payload } = found.version;
    return emojiOf(
      payload.emoji,
      'groupId' in payload ? payload.groupId : null,
    );
  };

  const getMemberLine = (member: PayMember) => {
    if (member.kind !== 'bill') {
      return describeFundingShort(
        member.payload.funding,
        member.payload.extras ?? [],
        member.kind,
      );
    }
    const { schedule } = member.payload.timing;
    const next = billPayments[member.itemId]?.find((entry) => !entry.paid);
    return next
      ? `Due\u00a0${describeDueDay(schedule, next.dueOn, today)}`
      : describeBillTiming(schedule);
  };

  const getPairingLine = (pairing: Pairing) =>
    pairing.amount.kind === 'exact'
      ? PAY_ITEMS_WORDS.paidFirstEach(describeAmount(pairing.amount))
      : capitalize(describeAmount(pairing.amount, name));

  const getGroupKey = (pay: FundingPay) =>
    `${pay.payLineId}:${pay.monthDay ?? ''}`;
  const monthlyLineIds = new Set(
    options
      .filter((option) => option.fundedBy.monthDay !== null)
      .map((option) => option.fundedBy.payLineId),
  );
  const groupKeys = [
    ...new Set([
      ...options.map((option) => option.value),
      ...[...monthlyLineIds].map((id) => `${id}:`),
      ...tied.map((member) => getGroupKey(member.pay)),
    ]),
  ];
  const groups = groupKeys
    .map((key) => ({
      key,
      members: tied.filter((member) => getGroupKey(member.pay) === key),
    }))
    .filter((group) => group.members.length > 0);
  const hasPaidFirst = pairings.length > 0;
  const isSpecific = options.length > 1 || groups.length > 1;
  const getHeading = (pay: FundingPay) => {
    if (!isSpecific)
      return isSource ? PAY_ITEMS_WORDS.alsoSource : PAY_ITEMS_WORDS.alsoPay;
    if (pay.monthDay !== null && !isSource)
      return PAY_ITEMS_WORDS.onDay(toDayWord(pay.monthDay));
    if (pay.monthDay !== null)
      return (
        options.find((option) => option.value === getGroupKey(pay))?.label ??
        PAY_ITEMS_WORDS.onDay(toDayWord(pay.monthDay))
      );
    if (!isSource) return PAY_ITEMS_WORDS.anyPay;
    return (
      plan
        .flatMap(({ payLines }) => payLines)
        .find(({ item }) => item.id === pay.payLineId)?.version.payload.name ??
      PAY_ITEMS_WORDS.anyPay
    );
  };
  const hasHeadings = hasPaidFirst || groups.length > 1;
  const rowCount = pairings.length + tied.length;
  const isSearchable = rowCount >= RUNWAY_SEARCH_THRESHOLD;
  const filter = isSearchable ? query : '';

  const toCandidates = (): Candidate[] => [
    ...bills.flatMap(({ item, version }) =>
      version.payload.timing.schedule.kind === 'once'
        ? []
        : [
            {
              kind: 'bill' as const,
              itemId: item.id,
              name: version.payload.name,
              emoji: emojiOf(version.payload.emoji, version.payload.groupId),
            },
          ],
    ),
    ...envelopes.map(({ item, version }) => ({
      kind: 'envelope' as const,
      itemId: item.id,
      name: version.payload.name,
      emoji: emojiOf(version.payload.emoji, version.payload.groupId),
    })),
    ...goals.map(({ item, version }) => ({
      kind: 'goal' as const,
      itemId: item.id,
      name: version.payload.name,
      emoji: emojiOf(version.payload.emoji, version.payload.groupId),
    })),
  ];
  const candidates = toCandidates().filter(
    (candidate) => !memberIds.has(candidate.itemId),
  );

  const write = async (
    itemKind: Kind,
    target: { itemId: string; name: string },
    pay: FundingPay | null,
  ) => {
    const bulk = bulkOf(itemKind);
    const plans = bulk.plan([target], (payload) => {
      if (itemKind === 'bill') {
        return {
          ...(payload as BillSealed),
          fundedBy: pay
            ? { kind: 'pay', payLineId: pay.payLineId, monthDay: pay.monthDay }
            : { kind: 'suggested' },
        };
      }
      const funded = payload as EnvelopeSealed | GoalSealed;
      return {
        ...funded,
        funding: {
          ...funded.funding,
          pay,
          ...(pay ? { sourceId: null } : {}),
        },
      };
    });
    const failed = await bulk.run(plans, { clearsPins: itemKind === 'bill' });
    return failed !== null && failed.length === 0;
  };

  const finish = async (saved: Promise<boolean>) => {
    if (await saved) {
      setPickedDay(null);
      setAddQuery('');
      setStep({ name: 'list' });
    }
  };

  const toBack = () => setStep({ name: 'list' });

  if (step.name === 'action') {
    const { member } = step;
    const { payload } = member;
    const defaultAmount: Pairing['amount'] =
      member.kind === 'bill'
        ? { kind: 'billShare', bps: 10_000 }
        : {
            kind: 'exact',
            cents:
              member.payload.funding.amount.kind === 'exact'
                ? member.payload.funding.amount.cents
                : 0,
          };
    return (
      <div className='flex flex-1 flex-col gap-4'>
        <BackLink onBack={toBack} />
        <ActionTitle>{payload.name}</ActionTitle>
        <ActionGroup>
          <ActionRow
            isGrouped
            hasChevron
            icon={<ChevronsUp />}
            label={PAY_ITEMS_WORDS.payFirst}
            subtitle={PAY_ITEMS_WORDS.payFirstSub}
            onClick={() =>
              onEditPairings([
                ...pairings,
                {
                  targetItemId: member.itemId,
                  amount: defaultAmount,
                  topUpFromAnySource: false,
                },
              ])
            }
          />
          <ActionRow
            isGrouped
            icon={<Unlink />}
            label={PAY_ITEMS_WORDS.stop}
            subtitle={
              member.kind === 'bill'
                ? PAY_ITEMS_WORDS.stopBillSub
                : PAY_ITEMS_WORDS.stopOtherSub
            }
            isDisabled={isWriting}
            onClick={() =>
              void finish(
                write(
                  member.kind,
                  { itemId: member.itemId, name: payload.name },
                  null,
                ),
              )
            }
          />
        </ActionGroup>
      </div>
    );
  }

  if (step.name === 'day') {
    const { candidate } = step;
    const picked = options.find((option) => option.value === pickedDay);
    return (
      <div className='flex flex-1 flex-col gap-4'>
        <BackLink onBack={() => setStep({ name: 'add' })} />
        <ActionTitle>{PAY_ITEMS_WORDS.dayTitle(candidate.name)}</ActionTitle>
        <ChoiceCards
          options={options.map((option) => ({
            value: option.value,
            title: option.label,
            body:
              option.fundedBy.monthDay !== null
                ? PAY_ITEMS_WORDS.dayBodyMonthly
                : PAY_ITEMS_WORDS.dayBodyPay,
          }))}
          value={pickedDay}
          onChange={setPickedDay}
        />
        <Button
          type='button'
          className='w-full'
          disabled={!picked || isWriting}
          loading={isWriting}
          onClick={() =>
            picked &&
            void finish(
              write(
                candidate.kind,
                { itemId: candidate.itemId, name: candidate.name },
                {
                  payLineId: picked.fundedBy.payLineId,
                  monthDay: picked.fundedBy.monthDay,
                },
              ),
            )
          }
        >
          {PAY_ITEMS_WORDS.addDay(candidate.name)}
        </Button>
      </div>
    );
  }

  if (step.name === 'add') {
    const shown = candidates.filter((candidate) =>
      matches(candidate.name, addQuery),
    );
    const pick = (candidate: Candidate) => {
      if (options.length > 1) {
        setPickedDay(null);
        setStep({ name: 'day', candidate });
        return;
      }
      const only = options[0];
      if (!only) return;
      void finish(
        write(
          candidate.kind,
          { itemId: candidate.itemId, name: candidate.name },
          {
            payLineId: only.fundedBy.payLineId,
            monthDay: only.fundedBy.monthDay,
          },
        ),
      );
    };
    return (
      <div className='flex flex-1 flex-col gap-4'>
        <BackLink onBack={toBack} />
        <ActionTitle>{PAY_ITEMS_WORDS.addTitle(name)}</ActionTitle>
        {candidates.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {PAY_ITEMS_WORDS.addNone}
          </p>
        ) : (
          <>
            {candidates.length >= RUNWAY_SEARCH_THRESHOLD && (
              <SearchInput
                value={addQuery}
                onChange={setAddQuery}
                placeholder={PAY_ITEMS_WORDS.addSearch}
              />
            )}
            <ul className='border-border bg-card divide-border max-h-[max(9rem,calc(92dvh-29rem))] divide-y overflow-y-auto rounded-2xl border'>
              {shown.map((candidate) => (
                <ItemRow
                  key={candidate.itemId}
                  name={candidate.name}
                  emoji={candidate.emoji}
                  detail={KIND_WORDS[candidate.kind]}
                  isPrivate={false}
                  onOpen={() => pick(candidate)}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  const renderMember = (member: PayMember) => (
    <ItemRow
      key={member.itemId}
      name={member.payload.name}
      emoji={emojiOf(member.payload.emoji, member.payload.groupId)}
      detail={getMemberLine(member)}
      onOpen={() => setStep({ name: 'action', member })}
    />
  );
  const shownPairings = pairings.filter((pairing) =>
    matches(nameOf(pairing.targetItemId), filter),
  );
  const list = (rows: ReactNode) => (
    <ul className='border-border bg-card divide-border divide-y rounded-2xl border'>
      {rows}
    </ul>
  );

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <BackLink onBack={onBack} />
      <ActionTitle>{PAY_ITEMS_WORDS.title(name)}</ActionTitle>
      {isSearchable && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={PAY_ITEMS_WORDS.search}
        />
      )}
      <div className='max-h-[max(9rem,calc(92dvh-29rem))] space-y-3 overflow-y-auto'>
        {rowCount === 0 && (
          <p className='text-muted-foreground text-sm'>
            {PAY_ITEMS_WORDS.empty}
          </p>
        )}
        {shownPairings.length > 0 && (
          <>
            <SectionDivider label={PAY_ITEMS_WORDS.paidFirst} />
            {list(
              shownPairings.map((pairing) => (
                <ItemRow
                  key={pairing.targetItemId}
                  name={nameOf(pairing.targetItemId)}
                  emoji={emojiById(pairing.targetItemId)}
                  detail={getPairingLine(pairing)}
                  onOpen={() => onEditPairings([...pairings])}
                />
              )),
            )}
          </>
        )}
        {groups.map((group) => {
          const shown = group.members.filter((member) =>
            matches(member.payload.name, filter),
          );
          return shown.length === 0 ? null : (
            <div key={group.key} className='space-y-3'>
              {hasHeadings && (
                <SectionDivider label={getHeading(shown[0].pay)} />
              )}
              {list(shown.map(renderMember))}
            </div>
          );
        })}
      </div>
      {isRepeating && options.length > 0 && (
        <Button
          type='button'
          variant='secondary'
          className='w-full'
          onClick={() => {
            setAddQuery('');
            setStep({ name: 'add' });
          }}
        >
          {PAY_ITEMS_WORDS.add}
        </Button>
      )}
    </div>
  );
}

export default PayItemsView;
