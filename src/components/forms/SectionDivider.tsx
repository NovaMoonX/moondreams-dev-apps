interface SectionDividerProps {
  label: string;
}

/** A hairline with a centered label, for breaking a long form into named sections. */
function SectionDivider({ label }: SectionDividerProps) {
  return (
    <div className='flex items-center gap-3 pt-2'>
      <div className='border-border flex-1 border-t' />
      <span className='text-muted-foreground text-sm font-medium'>{label}</span>
      <div className='border-border flex-1 border-t' />
    </div>
  );
}

export default SectionDivider;
