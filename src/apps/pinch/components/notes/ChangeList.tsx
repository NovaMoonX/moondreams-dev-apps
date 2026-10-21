interface ChangeListProps {
  changes: string[];
}

function ChangeList({ changes }: ChangeListProps) {
  if (changes.length === 0) {
    return null;
  }

  return (
    <div className='space-y-1'>
      <p className='text-muted-foreground text-xs'>You changed:</p>
      <ul className='list-disc space-y-0.5 pl-5 text-sm'>
        {changes.map((change, index) => (
          <li key={index} className='wrap-break-word'>
            {change}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ChangeList;
