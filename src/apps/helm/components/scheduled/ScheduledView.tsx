import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CalendarClock, ChevronRight } from 'lucide-react';

import SearchInput from '@/components/SearchInput';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import AssistantLine from '@apps/helm/components/activity/AssistantLine';
import ScheduledForm from '@apps/helm/components/scheduled/ScheduledForm';
import ScheduledSheet from '@apps/helm/components/scheduled/ScheduledSheet';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import AddRow from '@apps/helm/components/who/AddRow';
import { HELM_COPY } from '@apps/helm/constants';
import { MAX_SCHEDULED_ACTIONS } from '@apps/helm/engine/scheduledActions';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import {
  selectEndedScheduled,
  selectScheduledActions,
  selectScheduledCount,
} from '@apps/helm/store/selectors/scheduledSelectors';
import { readListMeta } from '@apps/helm/utils/scheduledWords';

interface ScheduledViewProps {
  onBack: () => void;
  onHome: () => void;
  onOpenActivity: () => void;
}

const SEARCH_FROM = 8;

/** Scheduled: every action that runs by itself, soonest first, with the paused ones after and the ended ones behind a thin row. A new one is the last row of the list. */
function ScheduledView({ onBack, onHome, onOpenActivity }: ScheduledViewProps) {
  const assistant = useAssistantName();
  const now = useNow(60_000);
  const { isLoaded, isFailed } = useAppSelector(
    (state) => state.helm.scheduledActions,
  );
  const homeZone =
    useAppSelector((state) => state.helm.profile?.timeZone) ?? 'UTC';
  const actions = useAppSelector(selectScheduledActions);
  const ended = useAppSelector(selectEndedScheduled);
  const count = useAppSelector(selectScheduledCount);
  const [openId, setOpenId] = useState<string | null>(null);
  const [formToken, setFormToken] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [isEndedOpen, setIsEndedOpen] = useState(false);
  const [endedLine, setEndedLine] = useState<{
    title: string;
    undo: () => void;
  } | null>(null);

  useScreenContext('scheduled', null, [], {
    ask: HELM_COPY.askScheduled,
    chip: HELM_COPY.chipScheduled,
    back: HELM_COPY.backToScheduled,
  });

  const needle = query.trim().toLowerCase();
  const shown = actions
    .filter((action) => action.title.toLowerCase().includes(needle))
    .slice(0, MAX_SCHEDULED_ACTIONS);
  const isFull = count >= MAX_SCHEDULED_ACTIONS;
  const start = () => setFormToken(Date.now());
  const addRow = isFull ? (
    <p className='text-muted-foreground px-4 py-3 text-[13px] text-pretty'>
      {HELM_COPY.scheduledFullLine(MAX_SCHEDULED_ACTIONS)}
    </p>
  ) : (
    <AddRow label={HELM_COPY.scheduledAdd} onClick={start} isInList />
  );

  return (
    <>
      <HelmHeader backLabel='Home' onBack={onBack} onHome={onHome} />
      <main className='space-y-4 pt-4'>
        <div className='space-y-1'>
          <h1 className='helm-serif text-[28px] leading-[34px]'>
            {HELM_COPY.scheduledTitle}
          </h1>
          {count > 0 && (
            <p className='text-muted-foreground text-[13px]'>
              {HELM_COPY.scheduledCount(count, MAX_SCHEDULED_ACTIONS)}
            </p>
          )}
        </div>
        {endedLine && (
          <AssistantLine>
            {HELM_COPY.scheduledEnded(endedLine.title)}
            {' · '}
            <Button
              type='button'
              variant='tertiary'
              size='stripped'
              className="relative inline h-auto min-h-0 p-0 align-baseline font-medium underline underline-offset-2 before:absolute before:-inset-2.5 before:content-['']"
              onClick={() => {
                endedLine.undo();
                setEndedLine(null);
              }}
            >
              {HELM_COPY.undo}
            </Button>
          </AssistantLine>
        )}
        {isFailed && !isLoaded && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.scheduledFailed}
          </p>
        )}
        {isLoaded && actions.length === 0 && ended.length === 0 && (
          <>
            <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
              {HELM_COPY.scheduledEmpty(assistant)}
            </p>
            <AddRow label={HELM_COPY.scheduledAdd} onClick={start} />
          </>
        )}
        {actions.length >= SEARCH_FROM && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={HELM_COPY.scheduledSearch}
          />
        )}
        {actions.length > 0 && (
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {shown.map((action) => (
              <li key={action.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  className='flex h-auto min-h-14 w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
                  onClick={() => setOpenId(action.id)}
                >
                  <CalendarClock
                    className='text-muted-foreground size-5 shrink-0'
                    aria-hidden='true'
                  />
                  <span className='min-w-0 flex-1'>
                    <span className='text-foreground block text-[15px] leading-[21px] break-words'>
                      {action.title}
                    </span>
                    <span className='text-muted-foreground block text-[13px] break-words'>
                      {readListMeta(action, homeZone, now)}
                    </span>
                  </span>
                  <ChevronRight
                    className='text-muted-foreground size-4 shrink-0'
                    aria-hidden='true'
                  />
                </Button>
              </li>
            ))}
            <li>{addRow}</li>
          </ul>
        )}
        {actions.length > 0 && (
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.scheduledFoot(assistant)}
          </p>
        )}
        {ended.length > 0 && (
          <section className='space-y-3'>
            <ShowMoreButton
              isOpen={isEndedOpen}
              onClick={() => setIsEndedOpen((isOpen) => !isOpen)}
            >
              {isEndedOpen
                ? HELM_COPY.scheduledEndedHide
                : HELM_COPY.scheduledEndedRow(ended.length)}
            </ShowMoreButton>
            {isEndedOpen && (
              <ul className='helm-card divide-border divide-y overflow-hidden'>
                {ended.map((action) => (
                  <li key={action.id} className='px-4 py-3'>
                    <span className='text-muted-foreground block text-[15px] leading-[21px] break-words'>
                      {action.title}
                    </span>
                    <span className='text-muted-foreground block text-[13px]'>
                      {readListMeta(action, homeZone, now)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
      <ScheduledSheet
        actionId={openId}
        onClose={() => setOpenId(null)}
        onOpenActivity={onOpenActivity}
        onEnded={(title, undo) => setEndedLine({ title, undo })}
      />
      {formToken !== null && (
        <ScheduledForm
          key={formToken}
          action={null}
          runKey={null}
          onClose={() => setFormToken(null)}
        />
      )}
    </>
  );
}

export default ScheduledView;
