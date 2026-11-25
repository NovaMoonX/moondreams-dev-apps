import { useState } from 'react';
import { Plus, Repeat } from 'lucide-react';

import FloatingAction from '@/components/FloatingAction';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import Subview from '@/components/Subview';
import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import AddRuleSheet, {
  type AddRuleView,
  type RuleSeed,
} from '@apps/runway/components/AddRuleSheet';
import ItemRow from '@apps/runway/components/ItemRow';
import { RULE_WORDS, RUNWAY_SEARCH_THRESHOLD } from '@apps/runway/constants';
import { isTrackingLevel } from '@apps/runway/engine/level';
import RuleSheet from '@apps/runway/forms/RuleSheet';
import { useRuleNames } from '@apps/runway/hooks/useRuleNames';
import {
  selectAllCards,
  selectIsRulesLoaded,
  selectRules,
} from '@apps/runway/store/selectors/runwaySelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import {
  setOpenRuleRequest,
  useHoldRuleRequest,
  useOpenRuleRequest,
} from '@apps/runway/utils/openRuleRequest';
import type { OpenRule } from '@apps/runway/types';

interface RulesScreenProps {
  onClose: () => void;
}

/** The rules made from purchases in Needs a home, as sentences grouped by card, the rules for any card last. */
function RulesScreen({ onClose }: RulesScreenProps) {
  const rules = useAppSelector(selectRules);
  const cards = useAppSelector(selectAllCards);
  const isLoaded = useAppSelector(selectIsRulesLoaded);
  const { describe, describeParts, isEnded, getEnvelopeName, getCardLabel } =
    useRuleNames();
  const { openView } = useRunwayUrlState();
  const [query, setQuery] = useState('');
  const requestedId = useOpenRuleRequest();
  const [openId, setOpenId] = useState<string | null>(null);
  const opened =
    rules.find((rule) => rule.id === (openId ?? requestedId)) ?? null;
  const closeRule = () => {
    setOpenId(null);
    setOpenRuleRequest(null);
  };
  useHoldRuleRequest();
  const canAdd = isTrackingLevel(useAppSelector(selectLevel));
  const [isAdding, setIsAdding] = useState(false);
  const [seed, setSeed] = useState<RuleSeed | null>(null);
  const [addView, setAddView] = useState<AddRuleView>('start');
  const [storeQuery, setStoreQuery] = useState('');
  const startAdding = () => {
    setAddView('start');
    setStoreQuery('');
    setIsAdding(true);
  };
  const openFromAdd = (ruleId: string) => {
    setIsAdding(false);
    setOpenId(ruleId);
  };
  const pickSeed = (picked: RuleSeed) => {
    setIsAdding(false);
    setSeed(picked);
  };
  const backToAdd = () => {
    setSeed(null);
    setIsAdding(true);
  };
  const needle = query.trim().toLowerCase();
  const shown = rules.filter(
    (rule) => needle === '' || describe(rule).toLowerCase().includes(needle),
  );
  const cardIds = [
    ...cards.map((card) => card.id),
    ...shown.flatMap((rule) =>
      rule.cardId !== null && !cards.some((card) => card.id === rule.cardId)
        ? [rule.cardId]
        : [],
    ),
  ];
  const groups = [...cardIds, null].flatMap((cardId) => {
    const rows = shown.filter((rule) => rule.cardId === cardId);
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
  });

  const renderRow = (rule: OpenRule, isCardLeftOut: boolean) => {
    const sentence = describe(rule, isCardLeftOut);
    const { subject, outcome } = describeParts(rule, isCardLeftOut);
    const detail = isEnded(rule)
      ? RULE_WORDS.endedEnvelope(getEnvelopeName(rule.target))
      : outcome;
    return (
      <ItemRow
        key={rule.id}
        name={subject}
        nameLines={3}
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
        ariaLabel={`${sentence}${isEnded(rule) ? `, ${detail}` : ''}. Open`}
        onOpen={() => setOpenId(rule.id)}
      />
    );
  };

  return (
    <Subview title={RULE_WORDS.title} onClose={onClose}>
      <div className='space-y-4'>
        {!isLoaded ? (
          <p className='text-muted-foreground text-sm'>{RULE_WORDS.loading}</p>
        ) : rules.length === 0 ? (
          <div className='space-y-3'>
            <p className='text-muted-foreground text-sm'>
              {canAdd ? RULE_WORDS.emptyAdd : RULE_WORDS.empty}
            </p>
            {!canAdd && (
              <Button type='button' onClick={() => openView('needsHome')}>
                {RULE_WORDS.goToNeedsHome}
              </Button>
            )}
          </div>
        ) : (
          <>
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
                  <SectionDivider label={group.label} />
                  <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                    {group.rows.map((rule) =>
                      renderRow(rule, group.key !== 'any'),
                    )}
                  </ul>
                </div>
              ))
            )}
          </>
        )}
      </div>
      {canAdd && isLoaded && (
        <FloatingAction
          isInSubview
          label={RULE_WORDS.add}
          icon={<Plus className='h-5 w-5' aria-hidden='true' />}
          onClick={startAdding}
        />
      )}
      {canAdd && isAdding && (
        <AddRuleSheet
          view={addView}
          query={storeQuery}
          onViewChange={setAddView}
          onQueryChange={setStoreQuery}
          onPick={pickSeed}
          onOpenRule={openFromAdd}
          onClose={() => setIsAdding(false)}
        />
      )}
      {canAdd && seed !== null && (
        <RuleSheet
          purchase={null}
          rule={null}
          seed={seed}
          onBack={backToAdd}
          onClose={() => setSeed(null)}
        />
      )}
      {opened !== null && (
        <RuleSheet
          key={opened.id}
          purchase={null}
          rule={opened}
          onClose={closeRule}
        />
      )}
    </Subview>
  );
}

export default RulesScreen;
