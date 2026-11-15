import { useEffect, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '@hooks/useAuth';
import { completeMcpSignIn } from '@lib/mcp/mcpCalls';
import { savePostLoginRedirect } from '@lib/postLoginRedirect';
import AuthRequiredState from '@ui/AuthRequiredState';
import Loading from '@ui/Loading';

const COPY = {
  signInTitle: 'Connect your assistant',
  signInMessage:
    'Sign in first, and your assistant will pick up right where it left off.',
  confirmTitle: 'Connect an assistant?',
  confirm:
    'Claude, Gemini or another assistant is asking to read your apps as you. Continue only if you started this from your assistant just now.',
  continue: 'Continue',
  working: 'Connecting your assistant…',
  workingHint: 'One moment, then you will be sent back to it.',
  missingTitle: 'This link is missing something',
  missing:
    'Start the connection again from your assistant, and it will bring you back here.',
  unverifiedTitle: 'Verify your email first',
  unverified:
    'Your assistant can only connect once your email address is verified. Check your inbox for the message, then start again from your assistant.',
  failedTitle: "That didn't connect",
  failedRetry: 'Something went wrong on our side. Give it another try.',
  failedRestart:
    'This connection has expired. Start it again from your assistant.',
  tryAgain: 'Try again',
  home: 'Go home',
} as const;

type Outcome = 'confirm' | 'working' | 'unverified' | 'retry' | 'restart';

const RETRYABLE = [
  'functions/unavailable',
  'functions/internal',
  'functions/unknown',
  'functions/deadline-exceeded',
];

const toOutcome = (error: unknown): Outcome => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return code === 'functions/failed-precondition' || message.includes('verif')
    ? 'unverified'
    : RETRYABLE.includes(code) || code === ''
      ? 'retry'
      : 'restart';
};

function Notice({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <div className='page flex items-center justify-center px-4 py-12'>
      <div className='border-border bg-card w-full max-w-md rounded-2xl border p-6 text-center'>
        <img
          src='/favicon.svg'
          alt=''
          className='mx-auto mb-4 size-12 rounded-xl'
        />
        <h1 className='text-xl font-semibold'>{title}</h1>
        <p className='text-muted-foreground mt-3 text-sm text-pretty'>
          {message}
        </p>
        <div className='mt-5 flex flex-wrap justify-center gap-2'>
          {children}
        </div>
      </div>
    </div>
  );
}

function HomeLink() {
  const navigate = useNavigate();
  return (
    <Button variant='secondary' onClick={() => navigate('/')}>
      {COPY.home}
    </Button>
  );
}

/** Where an assistant's sign-in passes through: signs the person in, then sends them back to the assistant. */
function ConnectAssistant() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const externalAuthId = params.get('external_auth_id');
  const [outcome, setOutcome] = useState<Outcome>('confirm');
  const isUnverified = user !== null && !user.emailVerified;

  useEffect(() => {
    if (loading || user || !externalAuthId) return;
    savePostLoginRedirect(location.pathname + location.search);
  }, [loading, user, externalAuthId, location.pathname, location.search]);

  // A link can be sent by someone else, so the person confirms before their account is attached to an assistant.
  const connect = (authId: string) => {
    setOutcome('working');
    completeMcpSignIn(authId)
      .then((redirectUri) => window.location.assign(redirectUri))
      .catch((error: unknown) => {
        console.error('Assistant sign-in did not finish', error);
        setOutcome(toOutcome(error));
      });
  };

  if (loading) return <Loading />;

  if (!externalAuthId) {
    return (
      <Notice title={COPY.missingTitle} message={COPY.missing}>
        <HomeLink />
      </Notice>
    );
  }

  if (!user) {
    return (
      <AuthRequiredState
        title={COPY.signInTitle}
        message={COPY.signInMessage}
      />
    );
  }

  if (isUnverified || outcome === 'unverified') {
    return (
      <Notice title={COPY.unverifiedTitle} message={COPY.unverified}>
        <HomeLink />
      </Notice>
    );
  }

  if (outcome === 'retry' || outcome === 'restart') {
    return (
      <Notice
        title={COPY.failedTitle}
        message={outcome === 'retry' ? COPY.failedRetry : COPY.failedRestart}
      >
        {outcome === 'retry' && (
          <Button onClick={() => connect(externalAuthId)}>
            {COPY.tryAgain}
          </Button>
        )}
        <HomeLink />
      </Notice>
    );
  }

  if (outcome === 'confirm') {
    return (
      <Notice title={COPY.confirmTitle} message={COPY.confirm}>
        <Button onClick={() => connect(externalAuthId)}>{COPY.continue}</Button>
        <HomeLink />
      </Notice>
    );
  }

  return (
    <Notice title={COPY.working} message={COPY.workingHint}>
      <div
        className='border-foreground/20 border-t-accent size-6 animate-spin rounded-full border-2'
        role='status'
        aria-label={COPY.working}
      />
    </Notice>
  );
}

export default ConnectAssistant;
