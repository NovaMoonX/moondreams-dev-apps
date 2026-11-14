import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import SearchInput from '@/components/SearchInput';
import { useAppSelector } from '@/store';
import { formatDateShort, formatTime } from '@/utils/formatUtils';
import OutsideConversationView from '@apps/helm/components/outside/OutsideConversationView';
import OutsideMark from '@apps/helm/components/outside/OutsideMark';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY, OUTSIDE_CONVERSATION_GAP_MS } from '@apps/helm/constants';
import { selectOutsideCaptures } from '@apps/helm/store/selectors/captureSelectors';
import {
  groupOutsideConversations,
  type OutsideConversation,
} from '@apps/helm/utils/outsideTurns';

const SEARCH_FROM_ROWS = 8;

const whenOf = (at: number) =>
  new Date(at).toDateString() === new Date().toDateString()
    ? formatTime(at)
    : formatDateShort(at);

const firstWords = (conversation: OutsideConversation) =>
  conversation.turns[0].isUnreadable
    ? HELM_COPY.unreadable
    : conversation.turns[0].text;

function ConversationRow({
  conversation,
  onOpen,
}: {
  conversation: OutsideConversation;
  onOpen: () => void;
}) {
  const count = conversation.turns.length;

  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto w-full items-start justify-between gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      onClick={onOpen}
    >
      <OutsideMark via={conversation.via} />
      <span className='min-w-0 flex-1'>
        <span className='flex items-baseline justify-between gap-3'>
          <span className='text-foreground min-w-0 truncate text-[13px] font-medium'>
            {HELM_COPY.assistantFrom(conversation.via)}
          </span>
          <span className='text-muted-foreground shrink-0 text-[13px] whitespace-nowrap tabular-nums'>
            {whenOf(conversation.endedAt)}
          </span>
        </span>
        <span className='text-foreground line-clamp-2 text-[15px] leading-[21px] break-words'>
          {firstWords(conversation)}
        </span>
        {count > 1 && (
          <span className='text-muted-foreground block text-[13px]'>
            {HELM_COPY.outsideQuestions(count)}
          </span>
        )}
      </span>
      <ChevronRight
        className='text-muted-foreground mt-1 size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

/** A utility screen: the conversations outside assistants started, newest first. */
function OutsideScreen({
  onBack,
  onOpenAssistants,
}: {
  onBack: () => void;
  onOpenAssistants: () => void;
}) {
  const captures = useAppSelector(selectOutsideCaptures);
  const { isLoaded, isFailed } = useAppSelector(
    (state) => state.helm.outsideCaptures,
  );
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const conversations = useMemo(
    () => groupOutsideConversations(captures, OUTSIDE_CONVERSATION_GAP_MS),
    [captures],
  );
  const needle = search.trim().toLowerCase();
  const shown = needle
    ? conversations.filter((conversation) =>
        [conversation.via, ...conversation.turns.map((turn) => turn.text)].some(
          (text) => text.toLowerCase().includes(needle),
        ),
      )
    : conversations;
  const open = conversations.find((entry) => entry.id === openId) ?? null;

  return (
    <>
      <main className='flex flex-1 flex-col gap-6'>
        <HelmHeader
          backLabel={HELM_COPY.backGeneric}
          onBack={onBack}
          onHome={onBack}
          showsHome={false}
        />
        <div className='flex flex-col gap-1'>
          <h1 className='helm-serif text-[28px] leading-[34px]'>
            {HELM_COPY.outsideTitle}
          </h1>
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {HELM_COPY.outsideLead}
          </p>
        </div>
        {conversations.length >= SEARCH_FROM_ROWS && (
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={HELM_COPY.outsideSearch}
          />
        )}
        {isFailed && !isLoaded && (
          <p className='helm-card p-4 text-[15px] text-pretty' role='alert'>
            {HELM_COPY.turnsFailed}
          </p>
        )}
        {isLoaded && conversations.length === 0 && (
          <div className='helm-card flex flex-col items-start gap-3 p-4'>
            <p className='text-[15px] text-pretty'>{HELM_COPY.outsideEmpty}</p>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={onOpenAssistants}
            >
              {HELM_COPY.outsideConnect}
            </Button>
          </div>
        )}
        {conversations.length > 0 && shown.length === 0 && (
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {HELM_COPY.outsideNoMatch}
          </p>
        )}
        {shown.length > 0 && (
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {shown.map((conversation) => (
              <li key={conversation.id}>
                <ConversationRow
                  conversation={conversation}
                  onOpen={() => setOpenId(conversation.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
      {open && (
        <OutsideConversationView
          conversation={open}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

export default OutsideScreen;
