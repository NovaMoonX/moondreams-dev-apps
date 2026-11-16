import { ClaudeMark, GeminiMark } from '@/components/BrandMarks';
import AssistantMark from '@apps/helm/components/activity/AssistantMark';

/** The mark of the outside assistant a turn came from: its product's mark when known, else its first letter. */
function OutsideMark({
  via,
  isSmall = false,
}: {
  via: string;
  isSmall?: boolean;
}) {
  const size = isSmall ? 'size-4 shrink-0' : 'size-[22px] shrink-0';
  if (via === 'Claude') return <ClaudeMark className={size} />;
  if (via === 'Gemini') return <GeminiMark className={size} />;
  return (
    <AssistantMark
      name={via}
      className={isSmall ? '!size-4 !text-[10px]' : undefined}
    />
  );
}

export default OutsideMark;
