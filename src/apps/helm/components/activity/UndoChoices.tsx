import AppCheckbox from '@/components/AppCheckbox';

interface UndoChoicesProps {
  units: { key: string; title: string; detail: string | null }[];
  picked: Set<string>;
  onChange: (picked: Set<string>) => void;
  isBusy: boolean;
}

/** One ticked row per thing that can be taken back alone; the person unticks what to keep. */
function UndoChoices({ units, picked, onChange, isBusy }: UndoChoicesProps) {
  const toggle = (key: string, isOn: boolean) => {
    const next = new Set(picked);
    if (isOn) next.add(key);
    else next.delete(key);
    onChange(next);
  };

  return (
    <ul className='divide-border divide-y'>
      {units.map((unit) => (
        <li key={unit.key}>
          <label className='flex min-h-12 items-start gap-3 py-2'>
            <AppCheckbox
              className='mt-0.5'
              checked={picked.has(unit.key)}
              disabled={isBusy}
              onCheckedChange={(isOn) => toggle(unit.key, isOn)}
            />
            <span className='min-w-0 flex-1'>
              <span className='block text-[15px] leading-[21px] break-words'>
                {unit.title}
              </span>
              {unit.detail && (
                <span className='text-muted-foreground block text-[13px] break-words'>
                  {unit.detail}
                </span>
              )}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

export default UndoChoices;
