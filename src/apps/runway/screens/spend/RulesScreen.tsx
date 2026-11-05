import { useState } from 'react';
import { Repeat } from 'lucide-react';

import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import Subview from '@/components/Subview';
import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import ItemRow from '@apps/runway/components/ItemRow';
import { RULE_WORDS, RUNWAY_SEARCH_THRESHOLD } from '@apps/runway/constants';
import RuleSheet from '@apps/runway/forms/RuleSheet';
import { useRuleNames } from '@apps/runway/hooks/useRuleNames';
import {
  selectAllCards,
  selectIsRulesLoaded,
  selectRules,
} from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import type { OpenRule } from '@apps/runway/types';

interface RulesScreenProps {
  onClose: () => void;
}

/** The rules made from purchases in Needs a home, as sentences grouped by card, the rules for any card last. */
function RulesScreen({ onClose }: RulesScreenProps) {
  const rules = useAppSelector(selectRules);
  const cards = useAppSelector(selectAllCards);
  const isLoaded = useAppSelector(selectIsRulesLoaded);
  const { describe, isEnded, getEnvelopeName, getCardLabel } = useRuleNames();
  const { openView } = useRunwayUrlState();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = rules.find((rule) => rule.id === openId) ?? null;
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
    const detail = isEnded(rule)
      ? RULE_WORDS.endedEnvelope(getEnvelopeName(rule.target))
      : undefined;
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
        ariaLabel={`${sentence}${detail ? `, ${detail}` : ''}. Open`}
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
            <p className='text-muted-foreground text-sm'>{RULE_WORDS.empty}</p>
            <Button type='button' onClick={() => openView('needsHome')}>
              {RULE_WORDS.goToNeedsHome}
            </Button>
          </div>
        ) : (
          <>
            <p className='text-muted-foreground text-sm'>{RULE_WORDS.intro}</p>
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
