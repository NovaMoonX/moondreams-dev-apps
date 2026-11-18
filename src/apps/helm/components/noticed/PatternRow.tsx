import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';
import { readStateWords } from '@apps/helm/components/noticed/patternWords';
import { useGuardrailDone } from '@apps/helm/components/noticed/useGuardrailThings';
import SourceRing from '@apps/helm/components/who/SourceRing';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenPattern } from '@apps/helm/types';

interface PatternRowProps {
  pattern: OpenPattern;
  assistant: string;
  onOpen: (patternId: string) => void;
}

/** One thing noticed: the hollow ring (inferred, always), the sentence (two lines at most), its state (or, for a guardrail answered yes, what it did) on a short line of its own and a muted line of its evidence, two lines at most. Opens the pattern. */
function PatternRow({ pattern, assistant, onOpen }: PatternRowProps) {
  const state = readStateWords(pattern, assistant);
  const done = useGuardrailDone(pattern);
  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto w-full min-w-0 items-start gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      aria-label={HELM_COPY.noticedSheetOpen(pattern.statement)}
      onClick={() => onOpen(pattern.id)}
    >
      <SourceRing
        isConfirmed={false}
        label={HELM_COPY.noticedRingLabel(assistant)}
        className='mt-1.5'
      />
      <span className='min-w-0 flex-1'>
        <span className='line-clamp-2 text-[15px] leading-[21px] break-words'>
          <PrivateTitle
            isPrivate={pattern.privacy === 'private'}
            className='text-foreground text-pretty'
          >
            {pattern.statement}
          </PrivateTitle>
        </span>
        <span
          className={join(
            'text-muted-foreground block text-[13px]',
            state.isAsking && 'text-primary font-medium',
          )}
        >
          {done?.line ?? state.line}
        </span>
        {pattern.evidenceLine !== '' && (
          <span className='text-muted-foreground line-clamp-2 text-[13px] break-words'>
            {pattern.evidenceLine}
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

export default PatternRow;
