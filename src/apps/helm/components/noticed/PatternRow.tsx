import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';
import { readStateWords } from '@apps/helm/components/noticed/patternWords';
import SourceRing from '@apps/helm/components/who/SourceRing';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenPattern } from '@apps/helm/types';

interface PatternRowProps {
  pattern: OpenPattern;
  assistant: string;
  onOpen: (patternId: string) => void;
}

/** One thing noticed: the hollow ring (inferred, always), the sentence, and a muted line of its evidence and state. Opens the pattern. */
function PatternRow({ pattern, assistant, onOpen }: PatternRowProps) {
  const state = readStateWords(pattern, assistant);
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
        <PrivateTitle
          isPrivate={pattern.privacy === 'private'}
          className='text-foreground text-[15px] leading-[21px] text-pretty'
        >
          {pattern.statement}
        </PrivateTitle>
        <span className='text-muted-foreground block text-[13px] break-words'>
          {pattern.evidenceLine !== '' && `${pattern.evidenceLine} · `}
          <span className={join(state.isAsking && 'text-primary font-medium')}>
            {state.line}
          </span>
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground mt-1 size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default PatternRow;
