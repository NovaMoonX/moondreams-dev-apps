import HelpTip from '@/components/HelpTip';

function WeekResetHelp() {
  return (
    <HelpTip title='Friday to Friday'>
      <p>
        AMC's week starts on Friday, when new movies open, and that's when your
        weekly count starts over.
      </p>
      <p className='opacity-50'>
        So “Since Friday” counts the movies you've seen from the most recent
        Friday until now, and your weekly goal is measured against it.
      </p>
    </HelpTip>
  );
}

export default WeekResetHelp;
