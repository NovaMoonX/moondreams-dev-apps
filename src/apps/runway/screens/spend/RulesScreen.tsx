import { useEffect, useState } from 'react';
import {
  ListChecks,
  MessageCircleQuestion,
  Repeat,
  Send,
  Trash2,
} from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AppCheckbox from '@/components/AppCheckbox';
import FormSheet from '@/components/FormSheet';
import Pill from '@/components/Pill';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import SelectionBar from '@/components/SelectionBar';
import Subview from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useLongPress } from '@/hooks/useLongPress';
import InlineNotice from '@/components/InlineNotice';
import { useSelection } from '@/hooks/useSelection';
import { useAppSelector } from '@/store';
import ItemRow from '@apps/runway/components/ItemRow';
import { RULE_WORDS, RUNWAY_SEARCH_THRESHOLD } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { findTakeovers, RULE_VARIES } from '@apps/runway/engine/rules';
import RuleSheet from '@apps/runway/forms/RuleSheet';
import { useRuleNames } from '@apps/runway/hooks/useRuleNames';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  deleteRules,
  undoDeleteRules,
  undoUpdateRules,
  updateRules,
  type RuleMove,
} from '@apps/runway/store/actions/ruleActions';
import {
  selectAllCards,
  selectEnvelopes,
  selectIsRulesLoaded,
  selectItemLooks,
  selectRules,
  selectRulesNeedingHome,
} from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import type { OpenRule } from '@apps/runway/types';
import {
  readRulesLanding,
  setRulesLanding,
} from '@apps/runway/utils/rulesLanding';

interface RulesScreenProps {
  onClose: () => void;
}

const HOME_KEY = 'needs-a-new-home';

function EnvelopePickSheet({
  count,
  onPick,
  onClose,
}: {
  count: number;
  onPick: (envelopeId: string) => void;
  onClose: () => void;
}) {
  const envelopes = useAppSelector((state) =>
    selectEnvelopes(state, todayAsUtcDate()),
  );
  const looks = useAppSelector(selectItemLooks);
  const [query, setQuery] = useState('');
  const shown = envelopes.filter(({ item }) =>
    (looks.get(item.id)?.name ?? '')
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={RULE_WORDS.bulkPickTitle}
    >
      <div className='space-y-3 pb-4'>
        <p className='text-muted-foreground text-sm'>
          {RULE_WORDS.bulkPickSub(count)}
        </p>
        {envelopes.length >= RUNWAY_SEARCH_THRESHOLD && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={RULE_WORDS.bulkSearch}
          />
        )}
        {envelopes.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {RULE_WORDS.bulkNoEnvelopes}
          </p>
        ) : shown.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {RULE_WORDS.bulkNoMatch}
          </p>
        ) : (
          <ul className='border-border divide-border bg-card max-h-[max(9rem,calc(92dvh-29rem))] divide-y overflow-y-auto rounded-2xl border'>
            {shown.map(({ item }) => {
              const name = looks.get(item.id)?.name ?? item.id;
              return (
                <ItemRow
                  key={item.id}
                  name={name}
                  emoji={looks.get(item.id)?.emoji ?? null}
                  isPrivate={false}
                  ariaLabel={name}
                  isAction
                  onOpen={() => onPick(item.id)}
                />
              );
            })}
          </ul>
        )}
      </div>
    </FormSheet>
  );
}

/** A group's heading: press and hold starts picking with the group ticked; while picking, it ticks or clears the whole group. */
function GroupHead({
  label,
  total,
  ticked,
  isSelecting,
  onToggle,
  onHold,
}: {
  label: string;
  total: number;
  ticked: number;
  isSelecting: boolean;
  onToggle: () => void;
  onHold: () => void;
}) {
  const longPress = useLongPress(onHold);
  const isAll = total > 0 && ticked === total;
  const tickLabel = isAll
    ? RULE_WORDS.groupUntick(label)
    : RULE_WORDS.groupTick(label);

  return (
    <SectionDivider
      label={
        isSelecting ? (
          <span className='flex items-center gap-2'>
            <AppCheckbox
              checked={isAll}
              indeterminate={ticked > 0 && !isAll}
              onCheckedChange={onToggle}
              aria-label={tickLabel}
            />
            <Button
              type='button'
              variant='tertiary'
              size='stripped'
              className="text-muted-foreground! relative text-sm font-medium whitespace-normal before:absolute before:inset-x-0 before:-inset-y-[10px] before:content-['']"
              aria-label={tickLabel}
              onClick={onToggle}
            >
              {label}
              <span className='max-sm:hidden'>
                {' '}
                · {RULE_WORDS.groupPicked(ticked, total)}
              </span>
            </Button>
          </span>
        ) : (
          <span
            className='block select-none [-webkit-touch-callout:none]'
            {...longPress}
          >
            {label}
          </span>
        )
      }
    />
  );
}

/** The rules made from purchases in Needs a home, as sentences: those whose envelope is gone first, then grouped by card, the rules for any card last. Press and hold picks several to move, set to ask every time, or remove. */
function RulesScreen({ onClose }: RulesScreenProps) {
  const today = todayAsUtcDate();
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const rules = useAppSelector(selectRules);
  const homeless = useAppSelector((state) =>
    selectRulesNeedingHome(state, today),
  );
  const looks = useAppSelector(selectItemLooks);
  const cards = useAppSelector(selectAllCards);
  const isLoaded = useAppSelector(selectIsRulesLoaded);
  const { describe, describeHome, describeTakeover, getCardLabel, liveIds } =
    useRuleNames();
  const { openView } = useRunwayUrlState();
  const [landing] = useState(readRulesLanding);
  const selection = useSelection(landing?.ruleIds ?? null);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  useEffect(() => setRulesLanding(null), []);
  const opened = rules.find((rule) => rule.id === openId) ?? null;
  const needle = query.trim().toLowerCase();
  const homelessIds = new Set(homeless.map((rule) => rule.id));
  const shown = rules.filter(
    (rule) => needle === '' || describe(rule).toLowerCase().includes(needle),
  );
  const shownHomeless = shown.filter((rule) => homelessIds.has(rule.id));
  const shownRest = shown.filter((rule) => !homelessIds.has(rule.id));
  const cardIds = [
    ...cards.map((card) => card.id),
    ...shownRest.flatMap((rule) =>
      rule.cardId !== null && !cards.some((card) => card.id === rule.cardId)
        ? [rule.cardId]
        : [],
    ),
  ];
  const groups = [
    ...(shownHomeless.length === 0
      ? []
      : [
          {
            key: HOME_KEY,
            label: RULE_WORDS.homeHeading,
            rows: shownHomeless,
          },
        ]),
    ...[...cardIds, null].flatMap((cardId) => {
      const rows = shownRest.filter((rule) => rule.cardId === cardId);
      return rows.length === 0
        ? []
        : [
            {
              key: cardId ?? 'any',
              label:
                cardId === null
                  ? RULE_WORDS.anyCard
                  : (getCardLabel(cardId) ?? RULE_WORDS.removedCard),
              rows,
            },
          ];
    }),
  ];
  const selected = shown.filter((rule) => selection.ids.has(rule.id));
  const landingCount =
    landing === null
      ? 0
      : landing.ruleIds.filter((id) => homelessIds.has(id)).length;
  const isNothingPicked = selected.length === 0;
  const canAsk = (rule: OpenRule) =>
    rule.merchantKey !== null && rule.target !== RULE_VARIES;
  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';

  const begin = (ids: readonly string[]) => {
    if (selection.isActive) {
      selection.toggle(ids);
      return;
    }
    selection.start();
    selection.toggle(ids);
  };

  const renderRow = (rule: OpenRule, isCardLeftOut: boolean) => {
    const sentence = describe(rule, isCardLeftOut);
    const detail = homelessIds.has(rule.id) ? describeHome(rule) : undefined;
    return (
      <ItemRow
        key={rule.id}
        name={sentence}
        leading={
          <span
            className='border-border bg-accent text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl border'
            aria-hidden='true'
          >
            <Repeat className='h-4 w-4' />
          </span>
        }
        detail={detail}
        isPrivate={false}
        ariaLabel={`${sentence}${detail ? `, ${detail}` : ''}${selection.isActive ? '' : '. Open'}`}
        tick={
          selection.isActive
            ? {
                checked: selection.ids.has(rule.id),
                onChange: () => selection.toggle([rule.id]),
                label: RULE_WORDS.pickRule(sentence),
              }
            : undefined
        }
        onOpen={selection.isActive ? undefined : () => setOpenId(rule.id)}
        onLongPress={() => begin([rule.id])}
      />
    );
  };

  const withWrite = async <T,>(
    run: (
      uid: string,
      encryption: Awaited<ReturnType<typeof getRunwayEncryption>>,
    ) => Promise<T>,
  ): Promise<T | null> => {
    if (!user || isWriting) return null;
    setIsWriting(true);
    try {
      return await run(user.uid, await getRunwayEncryption(user.uid));
    } catch {
      addToast({ title: RULE_WORDS.bulkFailed, type: 'error' });
      return null;
    } finally {
      setIsWriting(false);
    }
  };

  const reportUndo = (
    doneCount: number,
    stayed: readonly string[],
    failedCount: number,
  ) => {
    const notes = [
      ...(stayed.length > 0 ? [RULE_WORDS.undoLeft(stayed)] : []),
      ...(failedCount > 0 ? [RULE_WORDS.notSaved(failedCount)] : []),
    ];
    addToast({
      title:
        doneCount === 0
          ? RULE_WORDS.undoFailed
          : RULE_WORDS.undoneMany(doneCount),
      description: notes.length === 0 ? undefined : notes.join(' '),
      type:
        doneCount === 0 ? 'error' : notes.length === 0 ? 'success' : 'warning',
    });
  };

  const undoMoved = (moves: readonly RuleMove[]) => () =>
    void withWrite((uid, encryption) =>
      undoUpdateRules(uid, encryption, moves, RULE_WORDS.changeUndoMoved),
    ).then((outcome) => {
      if (outcome === null) return;
      reportUndo(
        outcome.done.length,
        outcome.skipped.map(({ after }) => describe(after)),
        outcome.failed.length,
      );
    });

  const undoRemoved = (removed: readonly OpenRule[]) => () =>
    void withWrite((uid, encryption) =>
      undoDeleteRules(uid, encryption, removed, RULE_WORDS.changeUndoRemoved),
    ).then((outcome) => {
      if (outcome === null) return;
      reportUndo(
        outcome.done.length,
        outcome.skipped.map((rule) => describe(rule)),
        outcome.failed.length,
      );
    });

  const report = (
    title: string,
    done: readonly { id: string }[],
    left: { skipped: readonly OpenRule[]; failed: readonly OpenRule[] },
    notes: readonly string[],
    undo: () => void,
  ) => {
    const lines = [
      ...notes,
      ...(left.skipped.length > 0
        ? [RULE_WORDS.leftAlone(left.skipped.map((rule) => describe(rule)))]
        : []),
      ...(left.failed.length > 0
        ? [RULE_WORDS.notSaved(left.failed.length)]
        : []),
    ];
    addToast({
      title: done.length === 0 ? RULE_WORDS.bulkNothing : title,
      description: lines.length === 0 ? undefined : lines.join(' '),
      type:
        done.length === 0
          ? left.failed.length > 0
            ? 'error'
            : 'warning'
          : lines.length === 0
            ? 'success'
            : 'warning',
      action:
        done.length === 0
          ? undefined
          : { label: RULE_WORDS.undo, onClick: undo },
    });
    if (done.length === 0) return;
    if (left.skipped.length + left.failed.length === 0) selection.exit();
    else selection.toggle(done.map(({ id }) => id));
  };

  const sendTo = async (envelopeId: string) => {
    setIsPicking(false);
    const targets = selected.filter((rule) => rule.target !== envelopeId);
    if (targets.length === 0) {
      addToast({ title: RULE_WORDS.bulkNothing, type: 'info' });
      return;
    }
    const outcome = await withWrite((uid, encryption) =>
      updateRules(uid, encryption, targets, envelopeId, (count) =>
        RULE_WORDS.changeMovedMany(count, nameOf(envelopeId)),
      ),
    );
    if (outcome === null) return;
    report(
      RULE_WORDS.movedMany(outcome.done.length, nameOf(envelopeId)),
      outcome.done.map(({ after }) => after),
      outcome,
      [],
      undoMoved(outcome.done),
    );
  };

  const askEachTime = async () => {
    const askable = selected.filter(canAsk);
    const stayCount = selected.filter(
      (rule) => rule.merchantKey === null,
    ).length;
    if (askable.length === 0) {
      addToast({
        title: RULE_WORDS.bulkNothing,
        description: RULE_WORDS.askNone,
        type: 'info',
      });
      return;
    }
    const skipNote =
      stayCount > 0 ? RULE_WORDS.askSkipNote(stayCount, selected.length) : null;
    if (
      skipNote !== null &&
      !(await confirm({
        title: RULE_WORDS.askConfirmTitle(askable.length),
        message: skipNote,
        confirmText: RULE_WORDS.askConfirmButton,
      }))
    ) {
      return;
    }
    const outcome = await withWrite((uid, encryption) =>
      updateRules(
        uid,
        encryption,
        askable,
        RULE_VARIES,
        RULE_WORDS.changeAskMany,
      ),
    );
    if (outcome === null) return;
    report(
      RULE_WORDS.askedMany(outcome.done.length),
      outcome.done.map(({ after }) => after),
      outcome,
      skipNote === null ? [] : [skipNote],
      undoMoved(outcome.done),
    );
  };

  const removeSelected = async () => {
    const targets = selected;
    if (targets.length === 0) return;
    const takeovers = findTakeovers(targets, rules, liveIds);
    const isConfirmed = await confirm({
      title: RULE_WORDS.deleteConfirmTitle(targets.length),
      message: [
        RULE_WORDS.deleteConfirmBody(targets.length),
        ...takeovers.slice(0, 2).map(describeTakeover),
        ...(takeovers.length > 2
          ? [RULE_WORDS.takeoverMore(takeovers.length - 2)]
          : []),
      ].join(' '),
      confirmText: RULE_WORDS.deleteConfirmButton(targets.length),
    });
    if (!isConfirmed) return;
    const outcome = await withWrite((uid, encryption) =>
      deleteRules(uid, encryption, targets, RULE_WORDS.changeRemovedMany),
    );
    if (outcome === null) return;
    report(
      RULE_WORDS.removedMany(outcome.done.length),
      outcome.done,
      outcome,
      [],
      undoRemoved(outcome.done),
    );
  };

  const allShownIds = shown.map((rule) => rule.id);
  const isAllPicked =
    allShownIds.length > 0 && allShownIds.every((id) => selection.ids.has(id));

  return (
    <Subview
      title={RULE_WORDS.title}
      onClose={onClose}
      onBack={selection.isActive ? selection.exit : undefined}
      headerAction={
        isLoaded && rules.length > 1 && !selection.isActive ? (
          <Button
            type='button'
            variant='base'
            size='sm'
            className="bg-muted text-foreground! border-border hover:bg-accent relative h-7 min-h-0 gap-1 rounded-full border px-3 py-0 text-sm font-medium whitespace-nowrap after:absolute after:-inset-x-1 after:-inset-y-[7px] after:content-['']"
            onClick={selection.start}
          >
            <ListChecks className='h-3.5 w-3.5' aria-hidden='true' />
            {RULE_WORDS.pick}
          </Button>
        ) : undefined
      }
    >
      <div className='space-y-4'>
        {!isLoaded ? (
          <p className='text-muted-foreground text-sm'>{RULE_WORDS.loading}</p>
        ) : rules.length === 0 ? (
          <div className='space-y-3'>
            <p className='text-muted-foreground text-sm'>{RULE_WORDS.empty}</p>
            <Button type='button' onClick={() => openView('needsHome')}>
              {RULE_WORDS.goToNeedsHome}
            </Button>
          </div>
        ) : (
          <>
            {landingCount > 0 && landing !== null && (
              <InlineNotice tone='info'>
                {RULE_WORDS.landing(landing.name, landingCount)}
              </InlineNotice>
            )}
            {selection.isActive && (
              <div className='space-y-2'>
                <SectionHeader
                  title={RULE_WORDS.pickedCount(selected.length)}
                  action={
                    <Button
                      type='button'
                      variant='secondary'
                      size='sm'
                      rounded='full'
                      className="relative h-7 px-3 after:absolute after:-inset-1.5 after:content-['']"
                      onClick={selection.exit}
                    >
                      {RULE_WORDS.done}
                    </Button>
                  }
                />
                <div className='flex flex-wrap items-center gap-2'>
                  <Pill
                    isThin
                    isSelected={false}
                    onClick={() => selection.toggle(allShownIds)}
                  >
                    {isAllPicked ? RULE_WORDS.clearAll : RULE_WORDS.selectAll}
                  </Pill>
                </div>
              </div>
            )}
            {rules.length >= RUNWAY_SEARCH_THRESHOLD && (
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder={RULE_WORDS.search}
              />
            )}
            {groups.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                {RULE_WORDS.noMatch}
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.key} className='space-y-2'>
                  <GroupHead
                    label={group.label}
                    total={group.rows.length}
                    ticked={
                      group.rows.filter((rule) => selection.ids.has(rule.id))
                        .length
                    }
                    isSelecting={selection.isActive}
                    onToggle={() =>
                      selection.toggle(group.rows.map((rule) => rule.id))
                    }
                    onHold={() => begin(group.rows.map((rule) => rule.id))}
                  />
                  <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                    {group.rows.map((rule) =>
                      renderRow(
                        rule,
                        group.key !== 'any' && group.key !== HOME_KEY,
                      ),
                    )}
                  </ul>
                </div>
              ))
            )}
          </>
        )}
      </div>
      {selection.isActive && (
        <SelectionBar
          note={isNothingPicked ? RULE_WORDS.nothingPicked : null}
          isStackedOnPhone
          actions={[
            {
              key: 'ask',
              label: RULE_WORDS.bulkAsk,
              icon: <MessageCircleQuestion className='h-4 w-4' />,
              isDisabled: isNothingPicked || isWriting,
              onClick: () => void askEachTime(),
            },
            {
              key: 'delete',
              label: RULE_WORDS.bulkDelete,
              icon: <Trash2 className='h-4 w-4' />,
              isIconOnPhone: true,
              isDestructive: true,
              isDisabled: isNothingPicked || isWriting,
              onClick: () => void removeSelected(),
            },
          ]}
          primary={{
            key: 'send',
            label: RULE_WORDS.bulkSend,
            icon: <Send className='h-4 w-4' />,
            isDisabled: isNothingPicked,
            isLoading: isWriting,
            onClick: () => setIsPicking(true),
          }}
        />
      )}
      {isPicking && (
        <EnvelopePickSheet
          count={selected.length}
          onPick={(envelopeId) => void sendTo(envelopeId)}
          onClose={() => setIsPicking(false)}
        />
      )}
      {opened !== null && (
        <RuleSheet
          key={opened.id}
          purchase={null}
          rule={opened}
          onClose={() => setOpenId(null)}
        />
      )}
    </Subview>
  );
}

export default RulesScreen;
