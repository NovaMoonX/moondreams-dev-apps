import { useState } from 'react';

import SectionDivider from '@/components/SectionDivider';
import HelpTip from '@/components/HelpTip';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import ForgetNoticedRow from '@apps/helm/components/noticed/ForgetNoticedRow';
import LearningSwitchRow from '@apps/helm/components/noticed/LearningSwitchRow';
import PatternRow from '@apps/helm/components/noticed/PatternRow';
import PatternSheet from '@apps/helm/components/noticed/PatternSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import {
  selectNoticedRows,
  selectShownObservations,
} from '@apps/helm/store/selectors/patternSelectors';

const ROWS_SHOWN = 3;

/** The first section of How {Name} sees you: the switch, what has been noticed with its evidence (three rows, then all of them), what is no longer used folded away, and Forget at the foot. */
function WhatIveNoticed() {
  const assistant = useAssistantName();
  const rows = useAppSelector(selectNoticedRows);
  const hasObservations = useAppSelector(
    (state) => selectShownObservations(state).length > 0,
  );
  const isLearningOn = useAppSelector(
    (state) => state.helm.profile?.isLearningOn ?? true,
  );
  const isLoaded = useAppSelector((state) => state.helm.patterns.isLoaded);
  const [openId, setOpenId] = useState<string | null>(null);
  const [isAll, setIsAll] = useState(false);
  const [isUnusedOpen, setIsUnusedOpen] = useState(false);
  const used = rows.filter((row) => row.isUsed);
  const unused = rows.filter((row) => !row.isUsed);
  const shown = isAll ? used : used.slice(0, ROWS_SHOWN);

  const list = (items: typeof rows) => (
    <ul className='helm-card divide-border divide-y overflow-hidden'>
      {items.map(({ pattern }) => (
        <li key={pattern.id}>
          <PatternRow
            pattern={pattern}
            assistant={assistant}
            onOpen={setOpenId}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <section className='space-y-3'>
      <SectionDivider
        label={
          <span className='inline-flex items-center gap-1.5 whitespace-nowrap'>
            {HELM_COPY.noticedTitle}
            <HelpTip title={HELM_COPY.noticedTitle}>
              {HELM_COPY.noticedHelp(assistant)}
            </HelpTip>
          </span>
        }
      />
      <ul className='helm-card divide-border divide-y px-3'>
        <LearningSwitchRow />
      </ul>
      {isLoaded && used.length === 0 && (
        <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
          {HELM_COPY.noticedEmpty(assistant)}
        </p>
      )}
      {!isLearningOn && (
        <p className='text-muted-foreground px-1 text-[13px] text-pretty'>
          {HELM_COPY.noticedOffNote}
        </p>
      )}
      {shown.length > 0 && list(shown)}
      {used.length > ROWS_SHOWN && (
        <div>
          <ShowMoreButton isOpen={isAll} onClick={() => setIsAll(!isAll)}>
            {isAll
              ? HELM_COPY.noticedShowFewer
              : HELM_COPY.noticedShowAll(used.length)}
          </ShowMoreButton>
        </div>
      )}
      {unused.length > 0 && (
        <div className='space-y-3'>
          <ShowMoreButton
            isOpen={isUnusedOpen}
            onClick={() => setIsUnusedOpen(!isUnusedOpen)}
          >
            {HELM_COPY.noticedNotUsed(unused.length)}
          </ShowMoreButton>
          {isUnusedOpen && list(unused)}
        </div>
      )}
      {(rows.length > 0 || hasObservations) && (
        <div className='pt-3'>
          <ForgetNoticedRow />
        </div>
      )}
      <PatternSheet patternId={openId} onClose={() => setOpenId(null)} />
    </section>
  );
}

export default WhatIveNoticed;
