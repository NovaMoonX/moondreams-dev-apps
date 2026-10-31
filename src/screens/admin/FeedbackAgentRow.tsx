import ExternalLinkText from '@/components/ExternalLinkText';
import {
  AGENT_STATE_LABEL,
  type AgentSummary,
} from '@lib/feedback/feedbackDisplay';

/** Where Claude's own session stands on feedback: the state, why it waits, and the session and draft PR it opened. */
function FeedbackAgentRow({ state, note, sessionUrl, prUrl }: AgentSummary) {
  return (
    <div className='space-y-1'>
      <p className='text-sm'>
        <span className='font-medium'>{AGENT_STATE_LABEL[state]}</span>
        {note ? <span className='text-muted-foreground'> · {note}</span> : null}
      </p>
      {sessionUrl ? (
        <ExternalLinkText href={sessionUrl} label='Claude session' />
      ) : null}
      {prUrl ? <ExternalLinkText href={prUrl} label='Draft PR' /> : null}
    </div>
  );
}

export default FeedbackAgentRow;
