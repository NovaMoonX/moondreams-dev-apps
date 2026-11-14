/** Three small dots that rise and fade in turn beside a "working" word; the colour is the text's. */
function WorkingDots() {
  return (
    <span
      aria-hidden='true'
      className='ml-0.5 inline-flex items-center gap-[3px] align-baseline'
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className='working-dot inline-block size-1 rounded-full bg-current'
          style={{ animationDelay: `${index * 0.15}s` }}
        />
      ))}
    </span>
  );
}

export default WorkingDots;
