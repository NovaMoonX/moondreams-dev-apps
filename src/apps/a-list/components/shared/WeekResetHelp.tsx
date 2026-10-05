import HelpTip from '@/components/HelpTip';

interface WeekResetHelpProps {
  /** For a spot inside a drawer, modal or subview, where a phone must not open a modal. */
  noModal?: boolean;
}

function WeekResetHelp({ noModal }: WeekResetHelpProps) {
  return (
    <HelpTip title='Friday to Friday' noModal={noModal}>
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
