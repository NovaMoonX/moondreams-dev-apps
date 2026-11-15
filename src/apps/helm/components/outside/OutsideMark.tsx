import { ClaudeMark, GeminiMark } from '@/components/BrandMarks';
import AssistantMark from '@apps/helm/components/activity/AssistantMark';

/** The mark of the outside assistant a turn came from: its product's mark when known, else its first letter. */
function OutsideMark({ via }: { via: string }) {
  if (via === 'Claude') return <ClaudeMark className='size-[22px] shrink-0' />;
  if (via === 'Gemini') return <GeminiMark className='size-[22px] shrink-0' />;
  return <AssistantMark name={via} />;
}

export default OutsideMark;
